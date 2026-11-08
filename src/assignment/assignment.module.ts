import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Agente } from '../agents/agente.entity.js';
import { Llamada } from '../calls/llamada.entity.js';
import { DashboardModule } from '../dashboard/dashboard.module.js';
import { AssignmentService } from './assignment.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Agente, Llamada]), DashboardModule],
  providers: [AssignmentService],
  exports: [AssignmentService],
})
export class AssignmentModule {}
