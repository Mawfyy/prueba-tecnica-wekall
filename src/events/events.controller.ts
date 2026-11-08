import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { EventsService, EVENT_TYPES, type IncomingEvent } from './events.service.js';

interface EventBody {
  eventId?: unknown;
  type?: unknown;
  timestamp?: unknown;
  payload?: unknown;
}

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  /**
   * Ingesta de eventos del PBX. Siempre responde 200 con un `status`
   * (`processed` | `duplicate` | `ignored`) para que el productor pueda
   * auditar; los errores de dominio no son errores HTTP.
   */
  @Post()
  async receive(@Body() body: EventBody) {
    const event = this.validate(body);
    return this.eventsService.handle(event);
  }

  private validate(body: EventBody): IncomingEvent {
    const { eventId, type } = body ?? {};
    if (typeof eventId !== 'string' || eventId.length === 0) {
      throw new BadRequestException('eventId (string) es obligatorio');
    }
    if (typeof type !== 'string' || !EVENT_TYPES.includes(type as never)) {
      throw new BadRequestException(
        `type debe ser uno de: ${EVENT_TYPES.join(', ')}`,
      );
    }
    if (body.timestamp !== undefined && typeof body.timestamp !== 'string') {
      throw new BadRequestException('timestamp debe ser un string ISO');
    }
    if (body.payload !== undefined && typeof body.payload !== 'object') {
      throw new BadRequestException('payload debe ser un objeto');
    }
    return {
      eventId,
      type: type as IncomingEvent['type'],
      timestamp: body.timestamp as string | undefined,
      payload: (body.payload ?? {}) as IncomingEvent['payload'],
    };
  }
}
