import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProcessedEvent } from './processed-event.entity.js';
import { AgentsModule } from '../agents/agents.module.js';
import { CallsModule } from '../calls/calls.module.js';
import { AssignmentModule } from '../assignment/assignment.module.js';
import { EventsController } from './events.controller.js';
import { EventsService } from './events.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProcessedEvent]),
    CallsModule,
    AgentsModule,
    AssignmentModule,
  ],
  providers: [EventsService],
  controllers: [EventsController],
})
export class EventsModule {}
