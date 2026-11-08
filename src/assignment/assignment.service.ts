import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Mutex } from 'async-mutex';
import { Agente } from '../agents/agente.entity.js';
import { Llamada } from '../calls/llamada.entity.js';
import { incomingMs } from '../calls/calls.service.js';
import { EstadoAgente } from '../domain/estado-agente.js';
import { EstadoLlamada } from '../domain/estado-llamada.js';
import { DashboardService } from '../dashboard/dashboard.service.js';

/**
 * Tiempo libre del agente en DISPONIBLE. "Idle max" = el que lleva más
 * tiempo libre = el `libreDesde` más antiguo (menor timestamp).
 */
function libreDesdeMs(agente: Agente): number {
  return (agente.libreDesde ?? agente.horaEntradaEstado ?? new Date()).getTime();
}

/**
 * Motor de asignación concurrente (Requerimiento 3).
 *
 * Algoritmo: FIFO + Idle-Max
 *   1. Toma la llamada EN_COLA más antigua (menor `marcasTiempo.incoming`).
 *   2. Entre los agentes DISPONIBLE que atienden su cola, elige el que
 *      lleva más tiempo libre (menor `libreDesde`).
 *   3. Repite hasta que no queden llamadas o no haya agentes compatibles.
 *
 * Concurrencia: `async-mutex` serializa TODO el ciclo leer-decidir-escribir.
 * Sin el mutex, dos eventos simultáneos (ej. dos `call.received`) pueden leer
 * el mismo agente DISPONIBLE y asignarle dos llamadas a la vez, o asignar la
 * misma llamada a dos agentes. El mutex garantiza que cada iteración observe
 * un estado consistente: una llamada se asigna a exactamente un agente.
 */
@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name);
  private readonly mutex = new Mutex();

  constructor(
    @InjectRepository(Agente)
    private readonly agenteRepo: Repository<Agente>,
    @InjectRepository(Llamada)
    private readonly llamadaRepo: Repository<Llamada>,
    private readonly dashboard: DashboardService,
  ) {}

  /** Idempotente y serializado: puede llamarse desde cualquier flujo. */
  assignPendingCalls(): Promise<void> {
    return this.mutex
      .runExclusive(async () => {
        for (;;) {
          // 1. FIFO: la llamada en cola más antigua. El orden se resuelve en
          //    memoria porque `marcasTiempo.incoming` vive en un jsonb.
          const enCola = await this.llamadaRepo.find({
            where: { estado: EstadoLlamada.EN_COLA },
          });
          if (enCola.length === 0) return;
          const llamada = enCola.reduce((masVieja, actual) =>
            incomingMs(actual) < incomingMs(masVieja) ? actual : masVieja,
          );

          // 2. Candidatos: DISPONIBLE y que atiendan la cola de la llamada.
          const disponibles = await this.agenteRepo.find({
            where: { estado: EstadoAgente.DISPONIBLE },
          });
          const candidatos = disponibles.filter((a) =>
            a.colas?.includes(llamada.cola),
          );
          if (candidatos.length === 0) return;

          // 3. Idle-Max: el de mayor tiempo libre.
          const agente = candidatos.reduce((mejor, actual) =>
            libreDesdeMs(actual) < libreDesdeMs(mejor) ? actual : mejor,
          );

          // 4. Asignación atómica (protegida por el mutex).
          const now = new Date();
          agente.estado = EstadoAgente.TIMBRANDO;
          agente.horaEntradaEstado = now;
          agente.libreDesde = null;
          llamada.estado = EstadoLlamada.TIMBRANDO;
          llamada.marcasTiempo = {
            ...llamada.marcasTiempo,
            ringing: now.toISOString(),
          };
          llamada.agenteId = agente.id;

          await this.agenteRepo.save(agente);
          await this.llamadaRepo.save(llamada);

          this.logger.log(
            `Llamada ${llamada.id} (${llamada.cola}) asignada a ${agente.id} [FIFO + idle-max]`,
          );
        }
      })
      .finally(() => {
        void this.dashboard.broadcast();
      });
  }
}
