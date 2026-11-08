import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Agente } from '../agents/agente.entity.js';
import { Cola } from '../queues/cola.entity.js';
import { EstadoAgente } from '../domain/estado-agente.js';

const SEED_AGENTES = [
  { id: 'AG-1001', nombre: 'Ana Torres', extension: '1001', colas: ['ventas'] },
  {
    id: 'AG-1002',
    nombre: 'Bruno Díaz',
    extension: '1002',
    colas: ['ventas', 'soporte'],
  },
  { id: 'AG-1003', nombre: 'Carla Ruiz', extension: '1003', colas: ['soporte'] },
  {
    id: 'AG-1004',
    nombre: 'Diego Pérez',
    extension: '1004',
    colas: ['soporte', 'facturacion'],
  },
];

const SEED_COLAS = [
  { id: 'ventas', nombre: 'Ventas', tiempoMaximoEspera: 60 },
  { id: 'soporte', nombre: 'Soporte', tiempoMaximoEspera: 90 },
  { id: 'facturacion', nombre: 'Facturación', tiempoMaximoEspera: 120 },
];

/** Carga inicial de colas y agentes (todos OFFLINE) si las tablas están vacías. */
@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(Agente)
    private readonly agenteRepo: Repository<Agente>,
    @InjectRepository(Cola)
    private readonly colaRepo: Repository<Cola>,
  ) {}

  async onModuleInit(): Promise<void> {
    if ((await this.colaRepo.count()) === 0) {
      await this.colaRepo.save(SEED_COLAS);
      this.logger.log(`Seed: ${SEED_COLAS.length} colas creadas`);
    }
    if ((await this.agenteRepo.count()) === 0) {
      await this.agenteRepo.save(
        SEED_AGENTES.map((agente) => ({
          ...agente,
          estado: EstadoAgente.OFFLINE,
        })),
      );
      this.logger.log(`Seed: ${SEED_AGENTES.length} agentes creados`);
    }
  }
}
