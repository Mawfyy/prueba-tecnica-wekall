import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Agent } from '../agents/agent.entity.js';
import { Call } from '../calls/call.entity.js';
import { QueuesService } from './queues.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Agent, Call])],
  providers: [QueuesService],
  exports: [QueuesService],
})
export class QueuesModule {}
