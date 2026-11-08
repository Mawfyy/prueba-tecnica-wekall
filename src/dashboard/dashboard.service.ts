import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Server } from 'socket.io';
import { Agent } from '../agents/agent.entity.js';
import { Call } from '../calls/call.entity.js';
import { QueuesService, type QueueMetrics } from '../queues/queues.service.js';

export interface DashboardSnapshot {
  serverTime: string;
  agents: Agent[];
  queues: QueueMetrics[];
  calls: Call[];
}

/**
 * Difunde el estado completo del tablero por Socket.io.
 *
 * Estrategia deliberada: en lugar de diffs incrementales, cada mutación
 * dispara un broadcast del snapshot completo. Es lo que permite que el
 * frontend se "resincronice silenciosamente" al reconectar: basta con
 * reenviar el snapshot en `handleConnection` (Punto Extra).
 */
@Injectable()
export class DashboardService {
  private server: Server | null = null;

  constructor(
    @InjectRepository(Agent)
    private readonly agentRepo: Repository<Agent>,
    @InjectRepository(Call)
    private readonly callRepo: Repository<Call>,
    private readonly queuesService: QueuesService,
  ) {}

  setServer(server: Server): void {
    this.server = server;
  }

  async snapshot(): Promise<DashboardSnapshot> {
    const [agents, queues, calls] = await Promise.all([
      this.agentRepo.find({ order: { id: 'ASC' } }),
      this.queuesService.getQueueMetrics(),
      this.queuesService.getActiveCalls(),
    ]);
    return {
      serverTime: new Date().toISOString(),
      agents,
      queues,
      calls,
    };
  }

  async broadcast(): Promise<void> {
    if (!this.server) return;
    try {
      this.server.emit('dashboard:state', await this.snapshot());
    } catch (error) {
      // El broadcast nunca debe tumbar el flujo de negocio.
      console.warn('Fallo difundiendo el snapshot del tablero:', error);
    }
  }
}
