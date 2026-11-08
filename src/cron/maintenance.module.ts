import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Agente } from '../agents/agente.entity.js';
import { AgentsModule } from '../agents/agents.module.js';
import { CallsModule } from '../calls/calls.module.js';
import { AssignmentModule } from '../assignment/assignment.module.js';
import { DashboardModule } from '../dashboard/dashboard.module.js';
import { MaintenanceService } from './maintenance.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Agente]),
    AgentsModule,
    CallsModule,
    AssignmentModule,
    DashboardModule,
  ],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
