import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
} from '@nestjs/common';
import { AgentsService } from './agents.service.js';
import { AssignmentService } from '../assignment/assignment.service.js';

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

  @Get()
  async list() {
    return this.agentsService.findAll();
  }

  /** Botón de supervisor: pausar manualmente (Punto Extra). */
  @Post('pause')
  async pause(@Body() body: AgentActionBody) {
    const agentId = this.requireAgentId(body);
    const reason =
      typeof body.reason === 'string' && body.reason.length > 0
        ? body.reason
        : undefined;
    const agent = await this.agentsService.pause(agentId, reason);
    return { ok: true, agent };
  }

  /** Botón de supervisor: despausar manualmente (Punto Extra). */
  @Post('unpause')
  async unpause(@Body() body: AgentActionBody) {
    const agentId = this.requireAgentId(body);
    const agent = await this.agentsService.unpause(agentId);
    // Al quedar DISPONIBLE puede haber llamadas esperando: reasignar.
    await this.assignment.assignPendingCalls();
    return { ok: true, agent };
  }

  private requireAgentId(body: AgentActionBody): string {
    if (typeof body?.agentId !== 'string' || body.agentId.length === 0) {
      throw new BadRequestException('agentId (string) es obligatorio');
    }
    return body.agentId;
  }
}
