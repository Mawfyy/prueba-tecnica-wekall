import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { LessThanOrEqual, Repository } from 'typeorm';
import { Agente } from './agente.entity.js';
import {
  EstadoAgente,
  assertTransition,
  InvalidTransitionError,
} from '../domain/estado-agente.js';
import { DashboardService } from '../dashboard/dashboard.service.js';

/** Posgestión obligatoria: 15 segundos exactos de WRAP_UP. */
export const DEFAULT_WRAP_UP_SECONDS = 15;

export interface ChangeStateOptions {
  motivoPausa?: string | null;
  posgestionHasta?: Date | null;
}

/**
 * Único punto de mutación del estado de un agente.
 * Toda transición pasa por `assertTransition`, así que es imposible
 * persistir un estado fuera de la máquina (Requerimiento 2).
 */
@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(
    @InjectRepository(Agente)
    private readonly agenteRepo: Repository<Agente>,
    private readonly dashboard: DashboardService,
    private readonly config: ConfigService,
  ) {}

  get wrapUpSeconds(): number {
    return this.config.get<number>('WRAP_UP_SECONDS', DEFAULT_WRAP_UP_SECONDS);
  }

  findAll(): Promise<Agente[]> {
    return this.agenteRepo.find({ order: { id: 'ASC' } });
  }

  async findOne(id: string): Promise<Agente> {
    const agente = await this.agenteRepo.findOneBy({ id });
    if (!agente) {
      throw new NotFoundException(`Agente ${id} no existe`);
    }
    return agente;
  }

  /**
   * Aplica la máquina de estados y recalcula los campos derivados:
   * - `horaEntradaEstado`: referencia del cronómetro del dashboard.
   * - `libreDesde`: se marca al entrar en DISPONIBLE (motor idle-max).
   * - `posgestionHasta`: vencimiento de la posgestión.
   */
  async changeState(
    agente: Agente,
    hacia: EstadoAgente,
    options: ChangeStateOptions = {},
  ): Promise<Agente> {
    assertTransition(agente.estado, hacia);
    const desde = agente.estado;
    const now = new Date();
    agente.estado = hacia;
    agente.horaEntradaEstado = now;
    agente.libreDesde = hacia === EstadoAgente.DISPONIBLE ? now : null;
    agente.motivoPausa =
      hacia === EstadoAgente.PAUSA
        ? (options.motivoPausa ?? 'Sin motivo especificado')
        : null;
    agente.posgestionHasta = options.posgestionHasta ?? null;
    await this.agenteRepo.save(agente);
    this.logger.log(`Agente ${agente.id}: ${desde} -> ${hacia}`);
    await this.dashboard.broadcast();
    return agente;
  }

  /**
   * EN_LLAMADA -> WRAP_UP con vencimiento a 15s.
   * El sweeper del cron lo promoverá a DISPONIBLE automáticamente.
   */
  async startWrapUp(agente: Agente): Promise<Agente> {
    const posgestionHasta = new Date(Date.now() + this.wrapUpSeconds * 1000);
    return this.changeState(agente, EstadoAgente.WRAP_UP, { posgestionHasta });
  }

  /**
   * Promueve a DISPONIBLE los agentes cuyo WRAP_UP ya venció.
   * Cubre tanto el caso normal (cron cada 1s) como reinicios del proceso:
   * si el servidor se cayó durante una posgestión, al arrancar el sweeper
   * termina el ciclo.
   */
  async sweepWrapUps(): Promise<number> {
    const vencidos = await this.agenteRepo.find({
      where: {
        estado: EstadoAgente.WRAP_UP,
        posgestionHasta: LessThanOrEqual(new Date()),
      },
    });
    for (const agente of vencidos) {
      await this.changeState(agente, EstadoAgente.DISPONIBLE);
    }
    return vencidos.length;
  }

  async pause(agenteId: string, motivo?: string): Promise<Agente> {
    const agente = await this.findOne(agenteId);
    return this.changeState(agente, EstadoAgente.PAUSA, {
      motivoPausa: motivo ?? 'Pausa manual del supervisor',
    });
  }

  async unpause(agenteId: string): Promise<Agente> {
    const agente = await this.findOne(agenteId);
    return this.changeState(agente, EstadoAgente.DISPONIBLE);
  }

  async login(agenteId: string): Promise<Agente> {
    const agente = await this.findOne(agenteId);
    return this.changeState(agente, EstadoAgente.DISPONIBLE);
  }

  async logout(agenteId: string): Promise<Agente> {
    const agente = await this.findOne(agenteId);
    return this.changeState(agente, EstadoAgente.OFFLINE);
  }

  /** Usado por los tests para validar que el servicio respeta la máquina. */
  validateTransition(desde: EstadoAgente, hacia: EstadoAgente): void {
    assertTransition(desde, hacia);
  }

  isInvalidTransitionError(error: unknown): error is InvalidTransitionError {
    return error instanceof InvalidTransitionError;
  }
}
