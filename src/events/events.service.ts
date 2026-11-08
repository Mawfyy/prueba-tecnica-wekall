import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProcessedEvent } from './processed-event.entity.js';
import { CallsService } from '../calls/calls.service.js';
import { AgentsService } from '../agents/agents.service.js';
import { AssignmentService } from '../assignment/assignment.service.js';
import { EstadoAgente } from '../domain/estado-agente.js';
import { EstadoLlamada } from '../domain/estado-llamada.js';
import { InconsistencyError } from '../domain/errors.js';

export const EVENT_TYPES = [
  'call.received',
  'call.answered',
  'call.noanswer',
  'call.hangup',
  'agent.login',
  'agent.logout',
  'agent.pause',
  'agent.unpause',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export interface EventPayload {
  callId?: string;
  agentId?: string;
  queue?: string;
  /** Número del cliente que llama (solo call.received). */
  numeroOrigen?: string;
  reason?: string;
}

export interface IncomingEvent {
  eventId: string;
  type: EventType;
  /** ISO timestamp del PBX; si falta se usa la hora de recepción. */
  timestamp?: string;
  payload?: EventPayload;
}

export type EventResultStatus = 'processed' | 'duplicate' | 'ignored';

export interface EventResult {
  eventId: string;
  status: EventResultStatus;
  reason?: string;
}

/**
 * Ingesta de eventos del PBX (Requerimiento 4):
 * - Idempotencia: `eventId` repetido se descarta (registro en processed_events).
 * - Resiliencia: cualquier inconsistencia se registra en log y se responde
 *   con `status: 'ignored'` sin romper el servicio ni el HTTP 200.
 */
@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    @InjectRepository(ProcessedEvent)
    private readonly processedRepo: Repository<ProcessedEvent>,
    private readonly callsService: CallsService,
    private readonly agentsService: AgentsService,
    private readonly assignment: AssignmentService,
  ) {}

  async handle(event: IncomingEvent): Promise<EventResult> {
    // --- Idempotencia ---
    const seen = await this.processedRepo.findOneBy({ eventId: event.eventId });
    if (seen) {
      this.logger.warn(`Evento duplicado descartado: ${event.eventId}`);
      return { eventId: event.eventId, status: 'duplicate' };
    }
    try {
      await this.processedRepo.insert({ eventId: event.eventId });
    } catch {
      // Carrera: otro request insertó el mismo eventId entre el findOne y aquí.
      this.logger.warn(
        `Evento duplicado descartado (clave duplicada): ${event.eventId}`,
      );
      return { eventId: event.eventId, status: 'duplicate' };
    }

    // --- Resiliencia ---
    try {
      await this.dispatch(event);
      return { eventId: event.eventId, status: 'processed' };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Inconsistencia en evento ${event.eventId} (${event.type}): ${reason}`,
      );
      return { eventId: event.eventId, status: 'ignored', reason };
    }
  }

  private dispatch(event: IncomingEvent): Promise<void> {
    const at = event.timestamp ? new Date(event.timestamp) : new Date();
    const payload: EventPayload = event.payload ?? {};

    switch (event.type) {
      case 'call.received':
        return this.onCallReceived(payload, at);
      case 'call.answered':
        return this.onCallAnswered(payload, at);
      case 'call.noanswer':
        return this.onCallNoAnswer(payload);
      case 'call.hangup':
        return this.onCallHangup(payload, at);
      case 'agent.login':
        return this.onAgentLogin(payload);
      case 'agent.logout':
        return this.onAgentLogout(payload);
      case 'agent.pause':
        return this.onAgentPause(payload);
      case 'agent.unpause':
        return this.onAgentUnpause(payload);
      default: {
        // TypeScript garantiza que no se llega aquí con los tipos actuales,
        // pero un payload malformado en runtime no debe tumbar el servicio.
        throw new InconsistencyError(`Tipo de evento desconocido`);
      }
    }
  }

  private requireCallId(payload: EventPayload): string {
    if (!payload.callId) {
      throw new InconsistencyError('payload.callId es obligatorio');
    }
    return payload.callId;
  }

  private requireAgentId(payload: EventPayload): string {
    if (!payload.agentId) {
      throw new InconsistencyError('payload.agentId es obligatorio');
    }
    return payload.agentId;
  }

  private async onCallReceived(
    payload: EventPayload,
    at: Date,
  ): Promise<void> {
    const callId = this.requireCallId(payload);
    if (!payload.queue) {
      throw new InconsistencyError('payload.queue es obligatorio');
    }
    await this.callsService.enqueue(callId, payload.queue, payload.numeroOrigen, at);
    await this.assignment.assignPendingCalls();
  }

  private async onCallAnswered(
    payload: EventPayload,
    at: Date,
  ): Promise<void> {
    const callId = this.requireCallId(payload);
    const call = await this.callsService.findOneOrFail(callId);
    const agentId = payload.agentId ?? call.agenteId;
    if (!agentId) {
      throw new InconsistencyError(
        `call.answered de ${callId} sin agente asignado`,
      );
    }
    const agent = await this.agentsService.findOne(agentId);
    if (call.estado !== EstadoLlamada.TIMBRANDO) {
      throw new InconsistencyError(
        `Llamada ${callId} no está TIMBRANDO (estado ${call.estado})`,
      );
    }
    if (agent.estado !== EstadoAgente.TIMBRANDO) {
      throw new InconsistencyError(
        `Agente ${agentId} no está TIMBRANDO (estado ${agent.estado})`,
      );
    }
    await this.callsService.applyAnswered(call, at);
    await this.agentsService.changeState(agent, EstadoAgente.EN_LLAMADA);
  }

  private async onCallNoAnswer(payload: EventPayload): Promise<void> {
    const callId = this.requireCallId(payload);
    const call = await this.callsService.findOneOrFail(callId);
    const agentId = payload.agentId ?? call.agenteId;
    if (!agentId) {
      throw new InconsistencyError(
        `call.noanswer de ${callId} sin agente asignado`,
      );
    }
    const agent = await this.agentsService.findOne(agentId);

    // La llamada vuelve al inicio de la cola (conserva su incoming original).
    await this.callsService.applyBackToQueue(call);
    // El agente en TIMBRANDO pasa a PAUSA con motivo "No contesta".
    await this.agentsService.changeState(agent, EstadoAgente.PAUSA, {
      motivoPausa: 'No contesta',
    });
    // Otros agentes DISPONIBLE pueden quedarse con la llamada ya mismo.
    await this.assignment.assignPendingCalls();
  }

  private async onCallHangup(
    payload: EventPayload,
    at: Date,
  ): Promise<void> {
    const callId = this.requireCallId(payload);
    const call = await this.callsService.findOneOrFail(callId);

    switch (call.estado) {
      case EstadoLlamada.CONECTADA: {
        await this.callsService.applyFinished(call, at);
        if (call.agenteId) {
          const agent = await this.agentsService.findOne(call.agenteId);
          // Posgestión obligatoria: WRAP_UP por 15s exactos.
          await this.agentsService.startWrapUp(agent);
        }
        return;
      }
      case EstadoLlamada.TIMBRANDO: {
        // El cliente colgó mientras sonaba: abandono y el agente queda libre.
        this.logger.warn(
          `Llamada ${callId} abandonada durante el timbrado; agente ${call.agenteId} vuelve a DISPONIBLE`,
        );
        await this.callsService.applyAbandoned(call, at);
        if (call.agenteId) {
          const agent = await this.agentsService.findOne(call.agenteId);
          await this.agentsService.changeState(agent, EstadoAgente.DISPONIBLE);
        }
        await this.assignment.assignPendingCalls();
        return;
      }
      case EstadoLlamada.EN_COLA: {
        this.logger.warn(`Llamada ${callId} abandonada mientras estaba en cola`);
        await this.callsService.applyAbandoned(call, at);
        return;
      }
      default:
        throw new InconsistencyError(
          `call.hangup de llamada ${callId} en estado ${call.estado}`,
        );
    }
  }

  private async onAgentLogin(payload: EventPayload): Promise<void> {
    const agentId = this.requireAgentId(payload);
    const agent = await this.agentsService.findOne(agentId);
    if (agent.estado !== EstadoAgente.OFFLINE) {
      throw new InconsistencyError(
        `agent.login de ${agentId} en estado ${agent.estado} (se esperaba OFFLINE)`,
      );
    }
    await this.agentsService.changeState(agent, EstadoAgente.DISPONIBLE);
    await this.assignment.assignPendingCalls();
  }

  private async onAgentLogout(payload: EventPayload): Promise<void> {
    const agentId = this.requireAgentId(payload);
    const agent = await this.agentsService.findOne(agentId);
    await this.agentsService.changeState(agent, EstadoAgente.OFFLINE);
  }

  private async onAgentPause(payload: EventPayload): Promise<void> {
    const agentId = this.requireAgentId(payload);
    await this.agentsService.pause(agentId, payload.reason);
  }

  private async onAgentUnpause(payload: EventPayload): Promise<void> {
    const agentId = this.requireAgentId(payload);
    await this.agentsService.unpause(agentId);
    await this.assignment.assignPendingCalls();
  }
}
