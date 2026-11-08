import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { LessThanOrEqual, Repository } from 'typeorm';
import { Agent } from './agent.entity.js';
import {
  AgentState,
  assertTransition,
  InvalidTransitionError,
} from '../domain/agent-state.js';
import { DashboardService } from '../dashboard/dashboard.service.js';

/** Posgestión obligatoria: 15 segundos exactos de WRAP_UP. */
export const DEFAULT_WRAP_UP_SECONDS = 15;

export interface ChangeStateOptions {
  pauseReason?: string | null;
  wrapUpUntil?: Date | null;
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
    @InjectRepository(Agent)
    private readonly agentRepo: Repository<Agent>,
    private readonly dashboard: DashboardService,
    private readonly config: ConfigService,
  ) {}

  get wrapUpSeconds(): number {
    return this.config.get<number>('WRAP_UP_SECONDS', DEFAULT_WRAP_UP_SECONDS);
  }

  findAll(): Promise<Agent[]> {
    return this.agentRepo.find({ order: { id: 'ASC' } });
  }

  async findOne(id: string): Promise<Agent> {
    const agent = await this.agentRepo.findOneBy({ id });
    if (!agent) {
      throw new NotFoundException(`Agente ${id} no existe`);
    }
    return agent;
  }

  /**
   * Aplica la máquina de estados y recalcula los campos derivados:
   * - `stateChangedAt`: referencia del cronómetro del dashboard.
   * - `idleSince`: se marca al entrar en DISPONIBLE (motor idle-max).
   * - `wrapUpUntil`: vencimiento de la posgestión.
   */
  async changeState(
    agent: Agent,
    to: AgentState,
    options: ChangeStateOptions = {},
  ): Promise<Agent> {
    assertTransition(agent.state, to);
    const from = agent.state;
    const now = new Date();
    agent.state = to;
    agent.stateChangedAt = now;
    agent.idleSince = to === AgentState.DISPONIBLE ? now : null;
    agent.pauseReason =
      to === AgentState.PAUSA
        ? (options.pauseReason ?? 'Sin motivo especificado')
        : null;
    agent.wrapUpUntil = options.wrapUpUntil ?? null;
    await this.agentRepo.save(agent);
    this.logger.log(`Agente ${agent.id}: ${from} -> ${to}`);
    await this.dashboard.broadcast();
    return agent;
  }

  /**
   * EN_LLAMADA -> WRAP_UP con vencimiento a 15s.
   * El sweeper del cron lo promoverá a DISPONIBLE automáticamente.
   */
  async startWrapUp(agent: Agent): Promise<Agent> {
    const wrapUpUntil = new Date(Date.now() + this.wrapUpSeconds * 1000);
    return this.changeState(agent, AgentState.WRAP_UP, { wrapUpUntil });
  }

  /**
   * Promueve a DISPONIBLE los agentes cuyo WRAP_UP ya venció.
   * Cubre tanto el caso normal (cron cada 1s) como reinicios del proceso:
   * si el servidor se cayó durante una posgestión, al arrancar el sweeper
   * termina el ciclo.
   */
  async sweepWrapUps(): Promise<number> {
    const due = await this.agentRepo.find({
      where: {
        state: AgentState.WRAP_UP,
        wrapUpUntil: LessThanOrEqual(new Date()),
      },
    });
    for (const agent of due) {
      await this.changeState(agent, AgentState.DISPONIBLE);
    }
    return due.length;
  }

  async pause(agentId: string, reason?: string): Promise<Agent> {
    const agent = await this.findOne(agentId);
    return this.changeState(agent, AgentState.PAUSA, {
      pauseReason: reason ?? 'Pausa manual del supervisor',
    });
  }

  async unpause(agentId: string): Promise<Agent> {
    const agent = await this.findOne(agentId);
    return this.changeState(agent, AgentState.DISPONIBLE);
  }

  async login(agentId: string): Promise<Agent> {
    const agent = await this.findOne(agentId);
    return this.changeState(agent, AgentState.DISPONIBLE);
  }

  async logout(agentId: string): Promise<Agent> {
    const agent = await this.findOne(agentId);
    return this.changeState(agent, AgentState.OFFLINE);
  }

  /** Usado por los tests para validar que el servicio respeta la máquina. */
  validateTransition(from: AgentState, to: AgentState): void {
    assertTransition(from, to);
  }

  isInvalidTransitionError(error: unknown): error is InvalidTransitionError {
    return error instanceof InvalidTransitionError;
  }
}
