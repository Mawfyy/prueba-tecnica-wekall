import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cola } from '../queues/cola.entity.js';
import { Llamada } from './llamada.entity.js';
import { EstadoLlamada } from '../domain/estado-llamada.js';
import { InconsistencyError } from '../domain/errors.js';
import { DashboardService } from '../dashboard/dashboard.service.js';
import { AgentsService } from '../agents/agents.service.js';
import { Agente } from '../agents/agente.entity.js';
import { EstadoAgente } from '../domain/estado-agente.js';

/** Timestamp de entrada a la cola en ms (0 si no existe, no debería). */
export function incomingMs(llamada: Llamada): number {
  const incoming = llamada.marcasTiempo?.incoming;
  return incoming ? Date.parse(incoming) : 0;
}

/**
 * Mutaciones de estado de las llamadas. Cada método valida el estado actual
 * y lanza `InconsistencyError` si no coincide; el servicio de eventos atrapa
 * ese error, lo registra y sigue vivo (resiliencia).
 */
@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    @InjectRepository(Llamada)
    private readonly llamadaRepo: Repository<Llamada>,
    @InjectRepository(Cola)
    private readonly colaRepo: Repository<Cola>,
    private readonly dashboard: DashboardService,
    private readonly agentsService: AgentsService,
    @InjectRepository(Agente)
    private readonly agentRepo: Repository<Agente>,
  ) {}

  /** Más recientes primero (por su entrada a la cola). */
  async findAll(): Promise<Llamada[]> {
    const llamadas = await this.llamadaRepo.find();
    return llamadas.sort((a, b) => incomingMs(b) - incomingMs(a));
  }

  async findOne(id: string): Promise<Llamada | null> {
    return this.llamadaRepo.findOneBy({ id });
  }

  async findOneOrFail(id: string): Promise<Llamada> {
    const llamada = await this.findOne(id);
    if (!llamada) {
      throw new InconsistencyError(`La llamada ${id} no existe`);
    }
    return llamada;
  }

  /** Entrada a la cola (evento call.received). */
  async enqueue(
    callId: string,
    cola: string,
    numeroOrigen: string | undefined,
    at: Date,
  ): Promise<Llamada> {
    const existing = await this.findOne(callId);
    if (existing) {
      throw new InconsistencyError(
        `La llamada ${callId} ya existe (estado ${existing.estado})`,
      );
    }
    const llamada = await this.llamadaRepo.save({
      id: callId,
      cola,
      numeroOrigen: numeroOrigen ?? 'desconocido',
      estado: EstadoLlamada.EN_COLA,
      marcasTiempo: { incoming: at.toISOString() },
    });
    this.logger.log(`Llamada ${callId} en cola ${cola}`);
    await this.dashboard.broadcast();
    return llamada;
  }

  private async persist(llamada: Llamada): Promise<Llamada> {
    const saved = await this.llamadaRepo.save(llamada);
    await this.dashboard.broadcast();
    return saved;
  }

  /** TIMBRANDO -> CONECTADA. Calcula el tiempoEsperaSeg (base de ASA/SLA). */
  async applyAnswered(llamada: Llamada, at: Date): Promise<Llamada> {
    if (llamada.estado !== EstadoLlamada.TIMBRANDO) {
      throw new InconsistencyError(
        `call.answered sobre llamada ${llamada.id} en estado ${llamada.estado} (se esperaba TIMBRANDO)`,
      );
    }
    const incoming = llamada.marcasTiempo.incoming
      ? Date.parse(llamada.marcasTiempo.incoming)
      : null;
    llamada.estado = EstadoLlamada.CONECTADA;
    llamada.marcasTiempo = { ...llamada.marcasTiempo, connected: at.toISOString() };
    llamada.tiempoEsperaSeg =
      incoming != null
        ? Math.max(0, Math.round((at.getTime() - incoming) / 1000))
        : null;
    return this.persist(llamada);
  }

  /**
   * TIMBRANDO -> EN_COLA (evento call.noanswer).
   * Conserva el `marcasTiempo.incoming` original: al ser la más vieja, el
   * orden FIFO la deja al inicio de la cola, como pide el enunciado.
   */
  async applyBackToQueue(llamada: Llamada): Promise<Llamada> {
    if (llamada.estado !== EstadoLlamada.TIMBRANDO) {
      throw new InconsistencyError(
        `call.noanswer sobre llamada ${llamada.id} en estado ${llamada.estado} (se esperaba TIMBRANDO)`,
      );
    }
    llamada.estado = EstadoLlamada.EN_COLA;
    llamada.agenteId = null;
    // El ringing anterior ya no aplica: vuelve a sonar en otro agente.
    const { ringing: _ringing, ...marcas } = llamada.marcasTiempo;
    llamada.marcasTiempo = marcas;
    return this.persist(llamada);
  }

  /** CONECTADA -> FINALIZADA. Calcula el tiempoConversacionSeg. */
  async applyFinished(llamada: Llamada, at: Date): Promise<Llamada> {
    if (llamada.estado !== EstadoLlamada.CONECTADA) {
      throw new InconsistencyError(
        `call.hangup sobre llamada ${llamada.id} en estado ${llamada.estado} (se esperaba CONECTADA)`,
      );
    }
    const connected = llamada.marcasTiempo.connected
      ? Date.parse(llamada.marcasTiempo.connected)
      : null;
    llamada.estado = EstadoLlamada.FINALIZADA;
    llamada.marcasTiempo = { ...llamada.marcasTiempo, ended: at.toISOString() };
    llamada.tiempoConversacionSeg =
      connected != null
        ? Math.max(0, Math.round((at.getTime() - connected) / 1000))
        : null;
    return this.persist(llamada);
  }

  /** EN_COLA o TIMBRANDO -> ABANDONADA (colgó el cliente / tiempoMaximoEspera). */
  async applyAbandoned(llamada: Llamada, at: Date): Promise<Llamada> {
    if (
      llamada.estado !== EstadoLlamada.EN_COLA &&
      llamada.estado !== EstadoLlamada.TIMBRANDO
    ) {
      throw new InconsistencyError(
        `Abandono sobre llamada ${llamada.id} en estado ${llamada.estado}`,
      );
    }
    llamada.estado = EstadoLlamada.ABANDONADA;
    llamada.marcasTiempo = {
      ...llamada.marcasTiempo,
      abandoned: at.toISOString(),
    };
    llamada.agenteId = null;
    return this.persist(llamada);
  }

  async expireRinging(ringTimeoutSec: number): Promise<number> {
    const llamadas = await this.llamadaRepo.find({
      where: {estado: EstadoLlamada.TIMBRANDO}
    });
    let contadorLlamadas = 0;
    for (const llamada of llamadas) {
      try {
        if (llamada.agenteId != null && llamada.marcasTiempo.ringing != null) {
          const agente = await this.agentRepo.findOne({
            where: { id: llamada.agenteId }
          })
          const totalTiempollamadaTimbrando = Date.now() - Date.parse(llamada.marcasTiempo.ringing);
          if (agente != null && totalTiempollamadaTimbrando >= ringTimeoutSec * 1000) {
            await this.agentsService.changeState(agente, EstadoAgente.DISPONIBLE);
            await this.applyBackToQueue(llamada);
            contadorLlamadas++
          }
        }
      } catch (error) {
        this.logger.error(`Hubo un error al tratar de encolar la llamada despues de un tiempo determinado ${llamada.id}`);
      }
    }

    return contadorLlamadas;
  }

  /**
   * Worker de tiempo máximo de espera: EN_COLA vencidas -> ABANDONADA.
   * El límite es el `tiempoMaximoEspera` de la entidad Cola de la llamada;
   * si la cola no está registrada se usa el default de configuración.
   */
  async expireWaiting(defaultMaxWaitTimeSec: number): Promise<number> {
    const enCola = await this.llamadaRepo.find({
      where: { estado: EstadoLlamada.EN_COLA },
    });
    if (enCola.length === 0) return 0;

    const colas = await this.colaRepo.find();
    const limites = new Map(colas.map((c) => [c.id, c.tiempoMaximoEspera]));
    const now = Date.now();

    let abandoned = 0;
    for (const llamada of enCola) {
      const limite = limites.get(llamada.cola) ?? defaultMaxWaitTimeSec;
      const incoming = llamada.marcasTiempo.incoming
        ? Date.parse(llamada.marcasTiempo.incoming)
        : null;
      if (incoming == null || now - incoming < limite * 1000) continue;
      try {
        await this.applyAbandoned(llamada, new Date());
        abandoned++;
        this.logger.warn(
          `Llamada ${llamada.id} ABANDONADA: superó tiempoMaximoEspera de la cola ${llamada.cola} (${limite}s)`,
        );
      } catch (error) {
        this.logger.warn(
          `No se pudo abandonar la llamada ${llamada.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return abandoned;
  }
}
