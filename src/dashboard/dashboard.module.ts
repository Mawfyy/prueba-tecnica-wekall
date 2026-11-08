import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Agente } from '../agents/agente.entity.js';
import { Llamada } from '../calls/llamada.entity.js';
import { QueuesModule } from '../queues/queues.module.js';
import { DashboardGateway } from './dashboard.gateway.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  // DashboardService inyecta los repos de Agent y Call: hay que declararlos aquí.
  imports: [TypeOrmModule.forFeature([Agente, Llamada]), QueuesModule],
  providers: [DashboardGateway, DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
