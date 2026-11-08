import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Call } from './call.entity.js';
import { DashboardModule } from '../dashboard/dashboard.module.js';
import { CallsController } from './calls.controller.js';
import { CallsService } from './calls.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Call]), DashboardModule],
  providers: [CallsService],
  controllers: [CallsController],
  exports: [CallsService],
})
export class CallsModule {}
