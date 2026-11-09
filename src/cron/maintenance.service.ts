import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Interval } from '@nestjs/schedule';
import { Agente } from '../agents/agente.entity.js';
import { AgentsService } from '../agents/agents.service.js';
import { CallsService } from '../calls/calls.service.js';
import { AssignmentService } from '../assignment/assignment.service.js';
import { DashboardService } from '../dashboard/dashboard.service.js';

/**
 * Workers periódicos (Puntos Extra):
 * - Cada 1s: saca de WRAP_UP a los agentes cuya posgestión de 15s venció.
 * - Cada 5s: abandona las llamadas EN_COLA que superaron el
 *   `tiempoMaximoEspera` de su cola (entidad Cola del PDF).
 */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    @InjectRepository(Agente)
    private readonly agenteRepo: Repository<Agente>,
    private readonly agentsService: AgentsService,
    private readonly callsService: CallsService,
    private readonly assignment: AssignmentService,
    private readonly dashboard: DashboardService,
    private readonly config: ConfigService,
  ) {}

  @Interval(1000)
  async sweepWrapUps(): Promise<void> {
    try {
      const count = await this.agentsService.sweepWrapUps();
      if (count > 0) {
        this.logger.log(
          `${count} agente(s) terminaron la posgestión -> DISPONIBLE`,
        );
        await this.assignment.assignPendingCalls();
      }
    } catch (error) {
      this.logger.error('Fallo el sweeper de WRAP_UP', error);
    }
  }

  @Interval(5000)
  async abandonExpiredCalls(): Promise<void> {
    try {
      const defaultMaxWaitTimeSec = this.config.get<number>(
        'MAX_WAIT_TIME_SEC',
        60,
      );
      const abandoned = await this.callsService.expireWaiting(
        defaultMaxWaitTimeSec,
      );
      if (abandoned > 0) {
        await this.dashboard.broadcast();
      }
    } catch (error) {
      this.logger.error('Fallo el worker de tiempo máximo de espera', error);
    }
  }

  @Interval(5000)
  async checkRinging(): Promise<void> {
    try {
      const timeoutSec = this.config.get<number>('MAX_RINGING_WAIT_SEC', 30);
      const contador = await this.callsService.expireRinging(timeoutSec);
      if (contador > 0) {
        this.logger.log(`${contador} llamada(s) TIMBRANDO sin respuesta -> EN_COLA`);
        await this.assignment.assignPendingCalls();
      }
    } catch (error) {
      this.logger.error('Fallo el worker de ring timeout', error);
    }
  }
}
