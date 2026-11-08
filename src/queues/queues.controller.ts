import { Controller, Get } from '@nestjs/common';
import { QueuesService } from './queues.service.js';

@Controller('queues')
export class QueuesController {
  constructor(private readonly queuesService: QueuesService) {}

  /**
   * Métricas por cola, incluyendo las avanzadas (Punto Extra):
   * ASA (Average Speed of Answer) y % de Nivel de Servicio (umbral 20s).
   */
  @Get()
  async metrics() {
    return this.queuesService.getQueueMetrics();
  }
}
