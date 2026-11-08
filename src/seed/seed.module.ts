import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Agente } from '../agents/agente.entity.js';
import { Cola } from '../queues/cola.entity.js';
import { SeedService } from './seed.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Agente, Cola])],
  providers: [SeedService],
})
export class SeedModule {}
