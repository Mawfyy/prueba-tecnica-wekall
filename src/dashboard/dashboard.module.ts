import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Agent } from '../agents/agent.entity.js';
import { Call } from '../calls/call.entity.js';
import { QueuesModule } from '../queues/queues.module.js';
import { DashboardGateway } from './dashboard.gateway.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  // DashboardService inyecta los repos de Agent y Call: hay que declararlos aquí.
  imports: [TypeOrmModule.forFeature([Agent, Call]), QueuesModule],
  providers: [DashboardGateway, DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
