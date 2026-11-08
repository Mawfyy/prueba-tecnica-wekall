import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import {
  EventsService,
  EVENT_TYPES,
  type EventResult,
  type IncomingEvent,
} from './events.service.js';

/**
 * El PDF define el evento con campos planos en el nivel raíz:
 * `{ eventId, ts, type, callId?, agentId?, queue?, callerId? }`.
 * Se tolera además un `payload` anidado (se fusiona con el nivel raíz).
 */
interface EventBody {
  eventId?: unknown;
  type?: unknown;
  ts?: unknown;
  timestamp?: unknown;
  callId?: unknown;
  agentId?: unknown;
  queue?: unknown;
  callerId?: unknown;
  reason?: unknown;
  payload?: Record<string, unknown> | null;
}

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  /**
   * Ingesta de eventos del PBX: uno por petición o en lote (array).
   * El lote se procesa en orden: el estado es una máquina secuencial y
   * procesar en paralelo podría invertir eventos contiguos.
   *
   * Siempre responde 200 con un `status` por evento
   * (`processed` | `duplicate` | `ignored`) para que el productor pueda
   * auditar; los errores de dominio no son errores HTTP.
   */
  @Post()
  async receive(
    @Body() body: EventBody | EventBody[],
  ): Promise<EventResult | EventResult[]> {
    if (Array.isArray(body)) {
      const results: EventResult[] = [];
      for (const item of body) {
        results.push(await this.eventsService.handle(this.validate(item)));
      }
      return results;
    }
    return this.eventsService.handle(this.validate(body));
  }

  private validate(body: EventBody): IncomingEvent {
    // Fusiona el formato plano del PDF con un posible payload anidado.
    const raw: Record<string, unknown> = { ...(body ?? {}), ...((body?.payload as Record<string, unknown>) ?? {}) };

    const eventId = raw.eventId;
    if (typeof eventId !== 'string' || eventId.length === 0) {
      throw new BadRequestException('eventId (string) es obligatorio');
    }
    const type = raw.type;
    if (typeof type !== 'string' || !EVENT_TYPES.includes(type as never)) {
      throw new BadRequestException(
        `type debe ser uno de: ${EVENT_TYPES.join(', ')}`,
      );
    }
    // `ts` es el campo del PDF; se acepta `timestamp` como alias.
    const ts = this.str(raw.ts) ?? this.str(raw.timestamp);
    return {
      eventId,
      type: type as IncomingEvent['type'],
      ts,
      callId: this.str(raw.callId),
      agentId: this.str(raw.agentId),
      queue: this.str(raw.queue),
      callerId: this.str(raw.callerId),
      reason: this.str(raw.reason),
    };
  }

  /** Solo acepta strings no vacíos; cualquier otra cosa se ignora. */
  private str(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
}
