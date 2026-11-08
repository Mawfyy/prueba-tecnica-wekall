import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentsService } from './agents.service.js';
import { Agent } from './agent.entity.js';
import {
  AgentState,
  InvalidTransitionError,
} from '../domain/agent-state.js';

function makeAgent(state: AgentState): Agent {
  return {
    id: 'AG-1001',
    name: 'Ana Torres',
    extension: '1001',
    queues: ['ventas'],
    state,
    stateChangedAt: new Date(Date.now() - 60_000),
    idleSince: state === AgentState.DISPONIBLE ? new Date() : null,
    pauseReason: null,
    wrapUpUntil: null,
  } as Agent;
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
      save: vi.fn(async (agent: Agent) => agent),
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
    const agent = makeAgent(AgentState.DISPONIBLE);
    const before = agent.stateChangedAt;

    const result = await service.changeState(agent, AgentState.PAUSA, {
      pauseReason: 'Almuerzo',
    });

    expect(result.state).toBe(AgentState.PAUSA);
    expect(result.pauseReason).toBe('Almuerzo');
    expect(result.idleSince).toBeNull();
    expect(result.stateChangedAt.getTime()).toBeGreaterThan(
      before.getTime(),
    );
    expect(repo.save).toHaveBeenCalledOnce();
    expect(dashboard.broadcast).toHaveBeenCalledOnce();
  });

  it('al entrar en DISPONIBLE marca idleSince y limpia la pausa', async () => {
    const agent = makeAgent(AgentState.PAUSA);
    agent.pauseReason = 'No contesta';

    const result = await service.changeState(agent, AgentState.DISPONIBLE);

    expect(result.idleSince).toBeInstanceOf(Date);
    expect(result.pauseReason).toBeNull();
  });

  it('rechaza transiciones inválidas sin persistir nada', async () => {
    const agent = makeAgent(AgentState.EN_LLAMADA);

    await expect(
      service.changeState(agent, AgentState.DISPONIBLE),
    ).rejects.toThrow(InvalidTransitionError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('startWrapUp programa la posgestión a 15 segundos exactos', async () => {
    const agent = makeAgent(AgentState.EN_LLAMADA);
    const before = Date.now();

    const result = await service.startWrapUp(agent);

    expect(result.state).toBe(AgentState.WRAP_UP);
    const durationMs = result.wrapUpUntil!.getTime() - before;
    expect(durationMs).toBeGreaterThanOrEqual(14_999);
    expect(durationMs).toBeLessThanOrEqual(15_001);
  });

  it('sweepWrapUps solo promueve agentes con la posgestión vencida', async () => {
    const due = makeAgent(AgentState.WRAP_UP);
    due.wrapUpUntil = new Date(Date.now() - 1);
    const notDue = makeAgent(AgentState.WRAP_UP);
    notDue.wrapUpUntil = new Date(Date.now() + 10_000);
    // El mock emula el filtro del repo: state = WRAP_UP y wrapUpUntil <= ahora.
    // TypeORM llega como FindOperator (LessThanOrEqual), extraemos su valor.
    repo.find.mockImplementation(async (options: {
      where?: { state?: AgentState; wrapUpUntil?: { value: Date } };
    }) => {
      const where = options?.where ?? {};
      const cutoff = where.wrapUpUntil?.value;
      return [due, notDue].filter(
        (a) =>
          (!where.state || a.state === where.state) &&
          (!cutoff || a.wrapUpUntil! <= cutoff),
      );
    });

    const promoted = await service.sweepWrapUps();

    expect(promoted).toBe(1);
    expect(due.state).toBe(AgentState.DISPONIBLE);
    expect(notDue.state).toBe(AgentState.WRAP_UP);
  });

  it('pause usa un motivo por defecto cuando no se envía', async () => {
    repo.findOneBy.mockResolvedValue(makeAgent(AgentState.DISPONIBLE));

    const result = await service.pause('AG-1001');

    expect(result.state).toBe(AgentState.PAUSA);
    expect(result.pauseReason).toBe('Pausa manual del supervisor');
  });
});
