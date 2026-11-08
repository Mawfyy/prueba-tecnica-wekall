import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Agente } from './agente.entity.js';
import { DashboardModule } from '../dashboard/dashboard.module.js';
import { AssignmentModule } from '../assignment/assignment.module.js';
import { AgentsController } from './agents.controller.js';
import { AgentsService } from './agents.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Agente]), DashboardModule, AssignmentModule],
  providers: [AgentsService],
  controllers: [AgentsController],
  exports: [AgentsService],
})
export class AgentsModule {}
