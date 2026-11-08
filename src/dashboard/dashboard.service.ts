import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Server } from 'socket.io';
import { Agente } from '../agents/agente.entity.js';
import { Llamada } from '../calls/llamada.entity.js';
import {
  QueuesService,
  type MetricasCola,
} from '../queues/queues.service.js';

export interface DashboardSnapshot {
  serverTime: string;
  agentes: Agente[];
  colas: MetricasCola[];
  llamadas: Llamada[];
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
    @InjectRepository(Agente)
    private readonly agenteRepo: Repository<Agente>,
    @InjectRepository(Llamada)
    private readonly llamadaRepo: Repository<Llamada>,
    private readonly queuesService: QueuesService,
  ) {}

  setServer(server: Server): void {
    this.server = server;
  }

  async snapshot(): Promise<DashboardSnapshot> {
    const [agentes, colas, llamadas] = await Promise.all([
      this.agenteRepo.find({ order: { id: 'ASC' } }),
      this.queuesService.getQueueMetrics(),
      this.queuesService.getActiveCalls(),
    ]);
    return {
      serverTime: new Date().toISOString(),
      agentes,
      colas,
      llamadas,
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
