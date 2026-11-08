import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssignmentService } from './assignment.service.js';
import { Agent } from '../agents/agent.entity.js';
import { Call } from '../calls/call.entity.js';
import { AgentState } from '../domain/agent-state.js';
import { CallState } from '../domain/call-state.js';

/**
 * Repositorios en memoria. Los `save` tienen un pequeño delay para que
 * cualquier carrera real entre invocaciones concurrentes se manifieste.
 */
class FakeAgentRepo {
  saved: Agent[] = [];
  constructor(public agents: Agent[]) {}
  async find({ where }: { where: { state: AgentState } }) {
    return this.agents.filter((a) => a.state === where.state);
  }
  async save(agent: Agent) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    this.saved.push(agent);
    return agent;
  }
}

class FakeCallRepo {
  saved: Call[] = [];
  constructor(public calls: Call[]) {}
  async findOne({
    where,
  }: {
    where: { state: CallState };
    order?: { enqueuedAt: 'ASC' | 'DESC' };
  }) {
    const candidates = this.calls
      .filter((c) => c.state === where.state)
      .sort((a, b) => a.enqueuedAt.getTime() - b.enqueuedAt.getTime());
    return candidates[0] ?? null;
  }
  async save(call: Call) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    this.saved.push(call);
    return call;
  }
}

function makeAgent(id: string, queues: string[], idleSince: Date): Agent {
  return {
    id,
    name: id,
    extension: id,
    queues,
    state: AgentState.DISPONIBLE,
    stateChangedAt: idleSince,
    idleSince,
    pauseReason: null,
    wrapUpUntil: null,
  } as Agent;
}

function makeCall(id: string, queue: string, enqueuedAt: Date): Call {
  return {
    id,
    queue,
    state: CallState.EN_COLA,
    enqueuedAt,
    assignedAt: null,
    answeredAt: null,
    endedAt: null,
    agentId: null,
    waitTimeSec: null,
    talkTimeSec: null,
  } as Call;
}

describe('AssignmentService (Requerimiento 3: FIFO + idle-max + mutex)', () => {
  let agentRepo: FakeAgentRepo;
  let callRepo: FakeCallRepo;
  let dashboard: { broadcast: ReturnType<typeof vi.fn> };
  let service: AssignmentService;

  beforeEach(() => {
    agentRepo = new FakeAgentRepo([]);
    callRepo = new FakeCallRepo([]);
    dashboard = { broadcast: vi.fn(async () => {}) };
    service = new AssignmentService(
      agentRepo as never,
      callRepo as never,
      dashboard as never,
    );
  });

  it('asigna primero la llamada más antigua (FIFO)', async () => {
    const now = Date.now();
    const older = makeCall('call-001', 'ventas', new Date(now - 60_000));
    const newer = makeCall('call-002', 'ventas', new Date(now - 10_000));
    callRepo.calls = [newer, older];
    agentRepo.agents = [makeAgent('AG-1001', ['ventas'], new Date(now))];

    await service.assignPendingCalls();

    expect(older.agentId).toBe('AG-1001');
    expect(older.state).toBe(CallState.TIMBRANDO);
    // El agente quedó ocupado: la segunda llamada sigue en cola.
    expect(newer.state).toBe(CallState.EN_COLA);
    expect(newer.agentId).toBeNull();
  });

  it('elige el agente con más tiempo libre (idle-max)', async () => {
    const now = Date.now();
    const busyRecently = makeAgent(
      'AG-1001',
      ['ventas'],
      new Date(now - 5_000),
    );
    const idleLongest = makeAgent('AG-1002', ['ventas'], new Date(now - 60_000));
    callRepo.calls = [makeCall('call-001', 'ventas', new Date(now))];
    agentRepo.agents = [busyRecently, idleLongest];

    await service.assignPendingCalls();

    expect(idleLongest.state).toBe(AgentState.TIMBRANDO);
    expect(busyRecently.state).toBe(AgentState.DISPONIBLE);
    expect(callRepo.calls[0].agentId).toBe('AG-1002');
  });

  it('solo asigna agentes que atienden la cola de la llamada', async () => {
    const now = Date.now();
    callRepo.calls = [makeCall('call-001', 'facturacion', new Date(now))];
    agentRepo.agents = [
      makeAgent('AG-1001', ['ventas'], new Date(now - 60_000)),
      makeAgent('AG-1002', ['soporte'], new Date(now - 30_000)),
    ];

    await service.assignPendingCalls();

    expect(callRepo.calls[0].state).toBe(CallState.EN_COLA);
    expect(agentRepo.saved).toHaveLength(0);
  });

  it('deja la llamada en cola si no hay agentes DISPONIBLE', async () => {
    const now = Date.now();
    callRepo.calls = [makeCall('call-001', 'ventas', new Date(now))];
    agentRepo.agents = [
      makeAgent('AG-1001', ['ventas'], new Date(now)),
    ];
    agentRepo.agents[0].state = AgentState.PAUSA;

    await service.assignPendingCalls();

    expect(callRepo.calls[0].state).toBe(CallState.EN_COLA);
  });

  it('bajo concurrencia, el mutex evita asignar una llamada a dos agentes', async () => {
    const now = Date.now();
    callRepo.calls = [
      makeCall('call-001', 'ventas', new Date(now - 30_000)),
      makeCall('call-002', 'ventas', new Date(now - 20_000)),
    ];
    agentRepo.agents = [
      makeAgent('AG-1001', ['ventas'], new Date(now - 60_000)),
      makeAgent('AG-1002', ['ventas'], new Date(now - 10_000)),
    ];

    // Dos flujos simultáneos (ej. dos call.received casi al mismo tiempo).
    await Promise.all([
      service.assignPendingCalls(),
      service.assignPendingCalls(),
    ]);

    const assigned = callRepo.calls.filter((c) => c.agentId !== null);
    expect(assigned).toHaveLength(2);

    // Cada llamada fue asignada exactamente una vez y a un agente distinto.
    const agentIds = assigned.map((c) => c.agentId).sort();
    expect(agentIds).toEqual(['AG-1001', 'AG-1002']);
    expect(new Set(agentIds).size).toBe(2);

    // Ninguna llamada fue "asignada" dos veces (sin duplicados en saved).
    const savedCallIds = callRepo.saved.map((c) => c.id).sort();
    expect(savedCallIds).toEqual(['call-001', 'call-002']);
  });
});
