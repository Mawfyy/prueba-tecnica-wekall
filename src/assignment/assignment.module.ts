import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Agent } from '../agents/agent.entity.js';
import { Call } from '../calls/call.entity.js';
import { DashboardModule } from '../dashboard/dashboard.module.js';
import { AssignmentService } from './assignment.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Agent, Call]), DashboardModule],
  providers: [AssignmentService],
  exports: [AssignmentService],
})
export class AssignmentModule {}
