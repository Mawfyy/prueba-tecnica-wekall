import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentsService } from './agents.service.js';
import { Agente } from './agente.entity.js';
import {
  EstadoAgente,
  InvalidTransitionError,
} from '../domain/estado-agente.js';

function makeAgente(estado: EstadoAgente): Agente {
  return {
    id: 'AG-1001',
    nombre: 'Ana Torres',
    extension: '1001',
    colas: ['ventas'],
    estado,
    horaEntradaEstado: new Date(Date.now() - 60_000),
    libreDesde: estado === EstadoAgente.DISPONIBLE ? new Date() : null,
    motivoPausa: null,
    posgestionHasta: null,
  } as Agente;
}

describe('AgentsService (aplicación de la máquina de estados)', () => {
  let repo: { find: ReturnType<typeof vi.fn>; findOneBy: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> };
  let dashboard: { broadcast: ReturnType<typeof vi.fn> };
  let config: { get: ReturnType<typeof vi.fn> };
  let service: AgentsService;

  beforeEach(() => {
    repo = {
      find: vi.fn(async () => []),
      findOneBy: vi.fn(async () => null),
      save: vi.fn(async (agente: Agente) => agente),
    };
    dashboard = { broadcast: vi.fn(async () => {}) };
    config = { get: vi.fn((_key: string, fallback: unknown) => fallback) };
    service = new AgentsService(
      repo as never,
      dashboard as never,
      config as never,
    );
  });

  it('aplica una transición válida y recalcula los campos derivados', async () => {
    const agente = makeAgente(EstadoAgente.DISPONIBLE);
    const before = agente.horaEntradaEstado;

    const result = await service.changeState(agente, EstadoAgente.PAUSA, {
      motivoPausa: 'Almuerzo',
    });

    expect(result.estado).toBe(EstadoAgente.PAUSA);
    expect(result.motivoPausa).toBe('Almuerzo');
    expect(result.libreDesde).toBeNull();
    expect(result.horaEntradaEstado.getTime()).toBeGreaterThan(
      before.getTime(),
    );
    expect(repo.save).toHaveBeenCalledOnce();
    expect(dashboard.broadcast).toHaveBeenCalledOnce();
  });

  it('al entrar en DISPONIBLE marca libreDesde y limpia la pausa', async () => {
    const agente = makeAgente(EstadoAgente.PAUSA);
    agente.motivoPausa = 'No contesta';

    const result = await service.changeState(agente, EstadoAgente.DISPONIBLE);

    expect(result.libreDesde).toBeInstanceOf(Date);
    expect(result.motivoPausa).toBeNull();
  });

  it('rechaza transiciones inválidas sin persistir nada', async () => {
    const agente = makeAgente(EstadoAgente.EN_LLAMADA);

    await expect(
      service.changeState(agente, EstadoAgente.DISPONIBLE),
    ).rejects.toThrow(InvalidTransitionError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('startWrapUp programa la posgestión a 15 segundos exactos', async () => {
    const agente = makeAgente(EstadoAgente.EN_LLAMADA);
    const before = Date.now();

    const result = await service.startWrapUp(agente);

    expect(result.estado).toBe(EstadoAgente.WRAP_UP);
    const durationMs = result.posgestionHasta!.getTime() - before;
    expect(durationMs).toBeGreaterThanOrEqual(14_999);
    expect(durationMs).toBeLessThanOrEqual(15_001);
  });

  it('sweepWrapUps solo promueve agentes con la posgestión vencida', async () => {
    const vencido = makeAgente(EstadoAgente.WRAP_UP);
    vencido.posgestionHasta = new Date(Date.now() - 1);
    const noVencido = makeAgente(EstadoAgente.WRAP_UP);
    noVencido.posgestionHasta = new Date(Date.now() + 10_000);
    // El mock emula el filtro del repo: estado = WRAP_UP y posgestionHasta <= ahora.
    // TypeORM llega como FindOperator (LessThanOrEqual), extraemos su valor.
    repo.find.mockImplementation(async (options: {
      where?: { estado?: EstadoAgente; posgestionHasta?: { value: Date } };
    }) => {
      const where = options?.where ?? {};
      const cutoff = where.posgestionHasta?.value;
      return [vencido, noVencido].filter(
        (a) =>
          (!where.estado || a.estado === where.estado) &&
          (!cutoff || a.posgestionHasta! <= cutoff),
      );
    });

    const promoted = await service.sweepWrapUps();

    expect(promoted).toBe(1);
    expect(vencido.estado).toBe(EstadoAgente.DISPONIBLE);
    expect(noVencido.estado).toBe(EstadoAgente.WRAP_UP);
  });

  it('pause usa un motivo por defecto cuando no se envía', async () => {
    repo.findOneBy.mockResolvedValue(makeAgente(EstadoAgente.DISPONIBLE));

    const result = await service.pause('AG-1001');

    expect(result.estado).toBe(EstadoAgente.PAUSA);
    expect(result.motivoPausa).toBe('Pausa manual del supervisor');
  });
});
