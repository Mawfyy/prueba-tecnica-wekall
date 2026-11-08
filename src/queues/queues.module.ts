import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Agente } from '../agents/agente.entity.js';
import { Llamada } from '../calls/llamada.entity.js';
import { Cola } from './cola.entity.js';
import { QueuesService } from './queues.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Agente, Llamada, Cola])],
  providers: [QueuesService],
  exports: [QueuesService],
})
export class QueuesModule {}
