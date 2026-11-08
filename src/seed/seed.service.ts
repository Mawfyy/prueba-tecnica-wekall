import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Agent } from '../agents/agent.entity.js';
import { AgentState } from '../domain/agent-state.js';

const SEED_AGENTS = [
  { id: 'AG-1001', name: 'Ana Torres', extension: '1001', queues: ['ventas'] },
  {
    id: 'AG-1002',
    name: 'Bruno Díaz',
    extension: '1002',
    queues: ['ventas', 'soporte'],
  },
  { id: 'AG-1003', name: 'Carla Ruiz', extension: '1003', queues: ['soporte'] },
  {
    id: 'AG-1004',
    name: 'Diego Pérez',
    extension: '1004',
    queues: ['soporte', 'facturacion'],
  },
];

/** Carga inicial de agentes (todos OFFLINE) si la tabla está vacía. */
@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(Agent)
    private readonly agentRepo: Repository<Agent>,
  ) {}

  async onModuleInit(): Promise<void> {
    if ((await this.agentRepo.count()) > 0) return;
    await this.agentRepo.save(
      SEED_AGENTS.map((agent) => ({ ...agent, state: AgentState.OFFLINE })),
    );
    this.logger.log(`Seed: ${SEED_AGENTS.length} agentes creados`);
  }
}
