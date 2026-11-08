import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Llamada } from './llamada.entity.js';
import { Cola } from '../queues/cola.entity.js';
import { DashboardModule } from '../dashboard/dashboard.module.js';
import { CallsController } from './calls.controller.js';
import { CallsService } from './calls.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Llamada, Cola]), DashboardModule],
  providers: [CallsService],
  controllers: [CallsController],
  exports: [CallsService],
})
export class CallsModule {}
