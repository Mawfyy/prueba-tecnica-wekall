import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { In } from 'typeorm';
import { Agent } from '../agents/agent.entity.js';
import { Call } from '../calls/call.entity.js';
import { CallState } from '../domain/call-state.js';

/** Umbral del Nivel de Servicio: llamada atendida en <= 20s (Punto Extra). */
export const DEFAULT_SLA_THRESHOLD_SEC = 20;

export interface QueueMetrics {
  queue: string;
  /** Llamadas EN_COLA ahora mismo. */
  waiting: number;
  /** Llamadas TIMBRANDO ahora mismo. */
  ringing: number;
  /** Atendidas (ATENDIDA + FINALIZADA) históricas. */
  answered: number;
  /** Abandonadas históricas. */
  abandoned: number;
  /** Espera actual más larga entre las llamadas EN_COLA. */
  maxWaitTimeSec: number;
  /** Average Speed of Answer: promedio de espera de las atendidas. */
  asaSec: number | null;
  /** % de atendidas dentro del umbral de SLA (20s por defecto). */
  slaPct: number | null;
}

@Injectable()
export class QueuesService {
  private readonly logger = new Logger(QueuesService.name);

  constructor(
    @InjectRepository(Agent)
    private readonly agentRepo: Repository<Agent>,
    @InjectRepository(Call)
    private readonly callRepo: Repository<Call>,
    private readonly config: ConfigService,
  ) {}

  get slaThresholdSec(): number {
    return this.config.get<number>('SLA_THRESHOLD_SEC', DEFAULT_SLA_THRESHOLD_SEC);
  }

  async getQueueMetrics(): Promise<QueueMetrics[]> {
    const [agents, calls] = await Promise.all([
      this.agentRepo.find(),
      this.callRepo.find(),
    ]);

    const queueNames = new Set<string>([
      ...agents.flatMap((a) => a.queues ?? []),
      ...calls.map((c) => c.queue),
    ]);

    const now = Date.now();
    const metrics: QueueMetrics[] = [];

    for (const queue of [...queueNames].sort()) {
      const ofQueue = calls.filter((c) => c.queue === queue);
      const waiting = ofQueue.filter((c) => c.state === CallState.EN_COLA);
      const answered = ofQueue.filter(
        (c) => c.state === CallState.ATENDIDA || c.state === CallState.FINALIZADA,
      );
      const abandoned = ofQueue.filter((c) => c.state === CallState.ABANDONADA);
      const ringing = ofQueue.filter((c) => c.state === CallState.TIMBRANDO);

      const waits = answered
        .map((c) => c.waitTimeSec)
        .filter((w): w is number => w != null);

      const asaSec =
        waits.length > 0
          ? Math.round(waits.reduce((sum, w) => sum + w, 0) / waits.length)
          : null;

      const slaPct =
        waits.length > 0
          ? Math.round(
              (waits.filter((w) => w <= this.slaThresholdSec).length /
                waits.length) *
                100,
            )
          : null;

      const maxWaitTimeSec =
        waiting.length > 0
          ? Math.round(
              Math.max(...waiting.map((c) => now - c.enqueuedAt.getTime())) / 1000,
            )
          : 0;

      metrics.push({
        queue,
        waiting: waiting.length,
        ringing: ringing.length,
        answered: answered.length,
        abandoned: abandoned.length,
        maxWaitTimeSec,
        asaSec,
        slaPct,
      });
    }

    return metrics;
  }

  /** Snapshot liviano de llamadas activas para el tablero. */
  async getActiveCalls(): Promise<Call[]> {
    return this.callRepo.find({
      where: { state: In([CallState.EN_COLA, CallState.TIMBRANDO]) },
      order: { enqueuedAt: 'ASC' },
    });
  }
}

