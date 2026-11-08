import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Mutex } from 'async-mutex';
import { Agent } from '../agents/agent.entity.js';
import { Call } from '../calls/call.entity.js';
import { AgentState } from '../domain/agent-state.js';
import { CallState } from '../domain/call-state.js';
import { DashboardService } from '../dashboard/dashboard.service.js';

/**
 * Tiempo libre del agente en DISPONIBLE. "Idle max" = el que lleva más
 * tiempo libre = el `idleSince` más antiguo (menor timestamp).
 */
function idleSinceMs(agent: Agent): number {
  return (agent.idleSince ?? agent.stateChangedAt ?? new Date()).getTime();
}

/**
 * Motor de asignación concurrente (Requerimiento 3).
 *
 * Algoritmo: FIFO + Idle-Max
 *   1. Toma la llamada EN_COLA más antigua (menor `enqueuedAt`).
 *   2. Entre los agentes DISPONIBLE que atienden su cola, elige el que
 *      lleva más tiempo libre (menor `idleSince`).
 *   3. Repite hasta que no queden llamadas o no haya agentes compatibles.
 *
 * Concurrencia: `async-mutex` serializa TODO el ciclo leer-decidir-escribir.
 * Sin el mutex, dos eventos simultáneos (ej. dos `call.received`) pueden leer
 * el mismo agente DISPONIBLE y asignarle dos llamadas a la vez, o asignar la
 * misma llamada a dos agentes. El mutex garantiza que cada iteración observe
 * un estado consistente: una llamada se asigna a exactamente un agente.
 */
@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name);
  private readonly mutex = new Mutex();

  constructor(
    @InjectRepository(Agent)
    private readonly agentRepo: Repository<Agent>,
    @InjectRepository(Call)
    private readonly callRepo: Repository<Call>,
    private readonly dashboard: DashboardService,
  ) {}

  /** Idempotente y serializado: puede llamarse desde cualquier flujo. */
  assignPendingCalls(): Promise<void> {
    return this.mutex
      .runExclusive(async () => {
        for (;;) {
          // 1. FIFO: la llamada en cola más antigua.
          const call = await this.callRepo.findOne({
            where: { state: CallState.EN_COLA },
            order: { enqueuedAt: 'ASC' },
          });
          if (!call) return;

          // 2. Candidatos: DISPONIBLE y que atiendan la cola de la llamada.
          const available = await this.agentRepo.find({
            where: { state: AgentState.DISPONIBLE },
          });
          const candidates = available.filter((a) =>
            a.queues?.includes(call.queue),
          );
          if (candidates.length === 0) return;

          // 3. Idle-Max: el de mayor tiempo libre.
          const agent = candidates.reduce((best, current) =>
            idleSinceMs(current) < idleSinceMs(best) ? current : best,
          );

          // 4. Asignación atómica (protegida por el mutex).
          const now = new Date();
          agent.state = AgentState.TIMBRANDO;
          agent.stateChangedAt = now;
          agent.idleSince = null;
          call.state = CallState.TIMBRANDO;
          call.assignedAt = now;
          call.agentId = agent.id;

          await this.agentRepo.save(agent);
          await this.callRepo.save(call);

          this.logger.log(
            `Llamada ${call.id} (${call.queue}) asignada a ${agent.id} [FIFO + idle-max]`,
          );
        }
      })
      .finally(() => {
        void this.dashboard.broadcast();
      });
  }
}
