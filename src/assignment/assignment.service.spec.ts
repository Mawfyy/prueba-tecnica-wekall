import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssignmentService } from './assignment.service.js';
import { Agente } from '../agents/agente.entity.js';
import { Llamada } from '../calls/llamada.entity.js';
import { EstadoAgente } from '../domain/estado-agente.js';
import { EstadoLlamada } from '../domain/estado-llamada.js';

/**
 * Repositorios en memoria. Los `save` tienen un pequeño delay para que
 * cualquier carrera real entre invocaciones concurrentes se manifieste.
 */
class FakeAgenteRepo {
  saved: Agente[] = [];
  constructor(public agentes: Agente[]) {}
  async find({ where }: { where: { estado: EstadoAgente } }) {
    return this.agentes.filter((a) => a.estado === where.estado);
  }
  async save(agente: Agente) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    this.saved.push(agente);
    return agente;
  }
}

class FakeLlamadaRepo {
  saved: Llamada[] = [];
  constructor(public llamadas: Llamada[]) {}
  async find({ where }: { where: { estado: EstadoLlamada } }) {
    return this.llamadas.filter((c) => c.estado === where.estado);
  }
  async save(llamada: Llamada) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    this.saved.push(llamada);
    return llamada;
  }
}

function makeAgente(id: string, colas: string[], libreDesde: Date): Agente {
  return {
    id,
    nombre: id,
    extension: id,
    colas,
    estado: EstadoAgente.DISPONIBLE,
    horaEntradaEstado: libreDesde,
    libreDesde,
    motivoPausa: null,
    posgestionHasta: null,
  } as Agente;
}

function makeLlamada(id: string, cola: string, incoming: Date): Llamada {
  return {
    id,
    numeroOrigen: '+5199999999',
    cola,
    estado: EstadoLlamada.EN_COLA,
    marcasTiempo: { incoming: incoming.toISOString() },
    agenteId: null,
    tiempoEsperaSeg: null,
    tiempoConversacionSeg: null,
  } as Llamada;
}

describe('AssignmentService (Requerimiento 3: FIFO + idle-max + mutex)', () => {
  let agenteRepo: FakeAgenteRepo;
  let llamadaRepo: FakeLlamadaRepo;
  let dashboard: { broadcast: ReturnType<typeof vi.fn> };
  let service: AssignmentService;

  beforeEach(() => {
    agenteRepo = new FakeAgenteRepo([]);
    llamadaRepo = new FakeLlamadaRepo([]);
    dashboard = { broadcast: vi.fn(async () => {}) };
    service = new AssignmentService(
      agenteRepo as never,
      llamadaRepo as never,
      dashboard as never,
    );
  });

  it('asigna primero la llamada más antigua (FIFO)', async () => {
    const now = Date.now();
    const older = makeLlamada('call-001', 'ventas', new Date(now - 60_000));
    const newer = makeLlamada('call-002', 'ventas', new Date(now - 10_000));
    llamadaRepo.llamadas = [newer, older];
    agenteRepo.agentes = [makeAgente('AG-1001', ['ventas'], new Date(now))];

    await service.assignPendingCalls();

    expect(older.agenteId).toBe('AG-1001');
    expect(older.estado).toBe(EstadoLlamada.TIMBRANDO);
    expect(older.marcasTiempo.ringing).toBeDefined();
    // El agente quedó ocupado: la segunda llamada sigue en cola.
    expect(newer.estado).toBe(EstadoLlamada.EN_COLA);
    expect(newer.agenteId).toBeNull();
  });

  it('elige el agente con más tiempo libre (idle-max)', async () => {
    const now = Date.now();
    const busyRecently = makeAgente(
      'AG-1001',
      ['ventas'],
      new Date(now - 5_000),
    );
    const idleLongest = makeAgente('AG-1002', ['ventas'], new Date(now - 60_000));
    llamadaRepo.llamadas = [makeLlamada('call-001', 'ventas', new Date(now))];
    agenteRepo.agentes = [busyRecently, idleLongest];

    await service.assignPendingCalls();

    expect(idleLongest.estado).toBe(EstadoAgente.TIMBRANDO);
    expect(busyRecently.estado).toBe(EstadoAgente.DISPONIBLE);
    expect(llamadaRepo.llamadas[0].agenteId).toBe('AG-1002');
  });

  it('solo asigna agentes que atienden la cola de la llamada', async () => {
    const now = Date.now();
    llamadaRepo.llamadas = [
      makeLlamada('call-001', 'facturacion', new Date(now)),
    ];
    agenteRepo.agentes = [
      makeAgente('AG-1001', ['ventas'], new Date(now - 60_000)),
      makeAgente('AG-1002', ['soporte'], new Date(now - 30_000)),
    ];

    await service.assignPendingCalls();

    expect(llamadaRepo.llamadas[0].estado).toBe(EstadoLlamada.EN_COLA);
    expect(agenteRepo.saved).toHaveLength(0);
  });

  it('deja la llamada en cola si no hay agentes DISPONIBLE', async () => {
    const now = Date.now();
    llamadaRepo.llamadas = [
      makeLlamada('call-001', 'ventas', new Date(now)),
    ];
    agenteRepo.agentes = [
      makeAgente('AG-1001', ['ventas'], new Date(now)),
    ];
    agenteRepo.agentes[0].estado = EstadoAgente.PAUSA;

    await service.assignPendingCalls();

    expect(llamadaRepo.llamadas[0].estado).toBe(EstadoLlamada.EN_COLA);
  });

  it('bajo concurrencia, el mutex evita asignar una llamada a dos agentes', async () => {
    const now = Date.now();
    llamadaRepo.llamadas = [
      makeLlamada('call-001', 'ventas', new Date(now - 30_000)),
      makeLlamada('call-002', 'ventas', new Date(now - 20_000)),
    ];
    agenteRepo.agentes = [
      makeAgente('AG-1001', ['ventas'], new Date(now - 60_000)),
      makeAgente('AG-1002', ['ventas'], new Date(now - 10_000)),
    ];

    // Dos flujos simultáneos (ej. dos call.received casi al mismo tiempo).
    await Promise.all([
      service.assignPendingCalls(),
      service.assignPendingCalls(),
    ]);

    const assigned = llamadaRepo.llamadas.filter((c) => c.agenteId !== null);
    expect(assigned).toHaveLength(2);

    // Cada llamada fue asignada exactamente una vez y a un agente distinto.
    const agentIds = assigned.map((c) => c.agenteId).sort();
    expect(agentIds).toEqual(['AG-1001', 'AG-1002']);
    expect(new Set(agentIds).size).toBe(2);

    // Ninguna llamada fue "asignada" dos veces (sin duplicados en saved).
    const savedCallIds = llamadaRepo.saved.map((c) => c.id).sort();
    expect(savedCallIds).toEqual(['call-001', 'call-002']);
  });
});
