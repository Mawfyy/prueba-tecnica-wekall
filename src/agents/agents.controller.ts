import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Post,
} from '@nestjs/common';
import { AgentsService } from './agents.service.js';
import { AssignmentService } from '../assignment/assignment.service.js';
import { Agente } from './agente.entity.js';
import { InvalidTransitionError } from '../domain/estado-agente.js';

interface AgentActionBody {
  agentId?: unknown;
  reason?: unknown;
}

@Controller('agents')
export class AgentsController {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly assignment: AssignmentService,
  ) {}

  /** Listar agentes (con estado y horaEntradaEstado). */
  @Get()
  async list() {
    return this.agentsService.findAll();
  }

  /** API REST del enunciado: login además del evento agent.login. */
  @Post('login')
  async login(@Body() body: AgentActionBody) {
    const agentId = this.requireAgentId(body);
    const agent = await this.guardTransition(() =>
      this.agentsService.login(agentId),
    );
    // Al quedar DISPONIBLE puede haber llamadas esperando: reasignar.
    await this.assignment.assignPendingCalls();
    return { ok: true, agent };
  }

  @Post('logout')
  async logout(@Body() body: AgentActionBody) {
    const agentId = this.requireAgentId(body);
    const agent = await this.guardTransition(() =>
      this.agentsService.logout(agentId),
    );
    return { ok: true, agent };
  }

  /** Botón de supervisor: pausar manualmente (Punto Extra). */
  @Post('pause')
  async pause(@Body() body: AgentActionBody) {
    const agentId = this.requireAgentId(body);
    const reason =
      typeof body.reason === 'string' && body.reason.length > 0
        ? body.reason
        : undefined;
    const agent = await this.guardTransition(() =>
      this.agentsService.pause(agentId, reason),
    );
    return { ok: true, agent };
  }

  /** Botón de supervisor: despausar manualmente (Punto Extra). */
  @Post('unpause')
  async unpause(@Body() body: AgentActionBody) {
    const agentId = this.requireAgentId(body);
    const agent = await this.guardTransition(() =>
      this.agentsService.unpause(agentId),
    );
    // Al quedar DISPONIBLE puede haber llamadas esperando: reasignar.
    await this.assignment.assignPendingCalls();
    return { ok: true, agent };
  }

  /**
   * Una transición rechazada por la máquina de estados no es un error del
   * servidor: es un conflicto con el estado actual (HTTP 409).
   */
  private async guardTransition(action: () => Promise<Agente>): Promise<Agente> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof InvalidTransitionError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  private requireAgentId(body: AgentActionBody): string {
    if (typeof body?.agentId !== 'string' || body.agentId.length === 0) {
      throw new BadRequestException('agentId (string) es obligatorio');
    }
    return body.agentId;
  }
}
