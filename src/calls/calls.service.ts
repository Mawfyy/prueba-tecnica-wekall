import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { Call } from './call.entity.js';
import { CallState } from '../domain/call-state.js';
import { InconsistencyError } from '../domain/errors.js';
import { DashboardService } from '../dashboard/dashboard.service.js';

/**
 * Mutaciones de estado de las llamadas. Cada método valida el estado actual
 * y lanza `InconsistencyError` si no coincide; el servicio de eventos atrapa
 * ese error, lo registra y sigue vivo (resiliencia).
 */
@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    @InjectRepository(Call)
    private readonly callRepo: Repository<Call>,
    private readonly dashboard: DashboardService,
  ) {}

  findAll(): Promise<Call[]> {
    return this.callRepo.find({ order: { enqueuedAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Call | null> {
    return this.callRepo.findOneBy({ id });
  }

  async findOneOrFail(id: string): Promise<Call> {
    const call = await this.findOne(id);
    if (!call) {
      throw new InconsistencyError(`La llamada ${id} no existe`);
    }
    return call;
  }

  /** Entrada a la cola (evento call.received). */
  async enqueue(callId: string, queue: string, at: Date): Promise<Call> {
    const existing = await this.findOne(callId);
    if (existing) {
      throw new InconsistencyError(
        `La llamada ${callId} ya existe (estado ${existing.state})`,
      );
    }
    const call = await this.callRepo.save({
      id: callId,
      queue,
      state: CallState.EN_COLA,
      enqueuedAt: at,
    });
    this.logger.log(`Llamada ${callId} en cola ${queue}`);
    await this.dashboard.broadcast();
    return call;
  }

  private async persist(call: Call): Promise<Call> {
    const saved = await this.callRepo.save(call);
    await this.dashboard.broadcast();
    return saved;
  }

  /** TIMBRANDO -> ATENDIDA. Calcula el waitTimeSec (base de ASA/SLA). */
  async applyAnswered(call: Call, at: Date): Promise<Call> {
    if (call.state !== CallState.TIMBRANDO) {
      throw new InconsistencyError(
        `call.answered sobre llamada ${call.id} en estado ${call.state} (se esperaba TIMBRANDO)`,
      );
    }
    call.state = CallState.ATENDIDA;
    call.answeredAt = at;
    call.waitTimeSec = Math.max(
      0,
      Math.round((at.getTime() - call.enqueuedAt.getTime()) / 1000),
    );
    return this.persist(call);
  }

  /**
   * TIMBRANDO -> EN_COLA (evento call.noanswer).
   * Conserva el `enqueuedAt` original: al ser la más vieja, el orden FIFO
   * la deja al inicio de la cola, como pide el enunciado.
   */
  async applyBackToQueue(call: Call): Promise<Call> {
    if (call.state !== CallState.TIMBRANDO) {
      throw new InconsistencyError(
        `call.noanswer sobre llamada ${call.id} en estado ${call.state} (se esperaba TIMBRANDO)`,
      );
    }
    call.state = CallState.EN_COLA;
    call.agentId = null;
    call.assignedAt = null;
    return this.persist(call);
  }

  /** ATENDIDA -> FINALIZADA. Calcula el talkTimeSec. */
  async applyFinished(call: Call, at: Date): Promise<Call> {
    if (call.state !== CallState.ATENDIDA) {
      throw new InconsistencyError(
        `call.hangup sobre llamada ${call.id} en estado ${call.state} (se esperaba ATENDIDA)`,
      );
    }
    call.state = CallState.FINALIZADA;
    call.endedAt = at;
    call.talkTimeSec = call.answeredAt
      ? Math.max(0, Math.round((at.getTime() - call.answeredAt.getTime()) / 1000))
      : null;
    return this.persist(call);
  }

  /** EN_COLA o TIMBRANDO -> ABANDONADA (colgó el cliente / maxWaitTimeSec). */
  async applyAbandoned(call: Call, at: Date): Promise<Call> {
    if (
      call.state !== CallState.EN_COLA &&
      call.state !== CallState.TIMBRANDO
    ) {
      throw new InconsistencyError(
        `Abandono sobre llamada ${call.id} en estado ${call.state}`,
      );
    }
    call.state = CallState.ABANDONADA;
    call.endedAt = at;
    call.agentId = null;
    return this.persist(call);
  }

  /** Worker de tiempo máximo de espera: EN_COLA vencidas -> ABANDONADA. */
  async expireWaiting(maxWaitTimeSec: number): Promise<number> {
    const cutoff = new Date(Date.now() - maxWaitTimeSec * 1000);
    const expired = await this.callRepo.find({
      where: { state: CallState.EN_COLA, enqueuedAt: LessThanOrEqual(cutoff) },
    });
    for (const call of expired) {
      try {
        await this.applyAbandoned(call, new Date());
        this.logger.warn(
          `Llamada ${call.id} ABANDONADA: superó maxWaitTimeSec (${maxWaitTimeSec}s)`,
        );
      } catch (error) {
        this.logger.warn(
          `No se pudo abandonar la llamada ${call.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return expired.length;
  }
}
