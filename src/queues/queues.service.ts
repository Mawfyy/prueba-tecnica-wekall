import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { In } from 'typeorm';
import { Agente } from '../agents/agente.entity.js';
import { Llamada } from '../calls/llamada.entity.js';
import { Cola } from './cola.entity.js';
import { EstadoLlamada } from '../domain/estado-llamada.js';

/** Umbral del Nivel de Servicio: llamada atendida en <= 20s (Punto Extra). */
export const DEFAULT_SLA_THRESHOLD_SEC = 20;

export interface MetricasCola {
  cola: string;
  nombre: string | null;
  /** Llamadas EN_COLA ahora mismo. */
  enEspera: number;
  /** Llamadas TIMBRANDO ahora mismo. */
  timbrando: number;
  /** Atendidas (CONECTADA + FINALIZADA) históricas. */
  atendidas: number;
  /** Abandonadas históricas. */
  abandonadas: number;
  /** Espera actual más larga entre las llamadas EN_COLA. */
  esperaMaximaSeg: number;
  /** Average Speed of Answer: promedio de espera de las atendidas. */
  asaSeg: number | null;
  /** % de atendidas dentro del umbral de SLA (20s por defecto). */
  slaPct: number | null;
}

@Injectable()
export class QueuesService {
  private readonly logger = new Logger(QueuesService.name);

  constructor(
    @InjectRepository(Agente)
    private readonly agenteRepo: Repository<Agente>,
    @InjectRepository(Llamada)
    private readonly llamadaRepo: Repository<Llamada>,
    @InjectRepository(Cola)
    private readonly colaRepo: Repository<Cola>,
    private readonly config: ConfigService,
  ) {}

  get slaThresholdSec(): number {
    return this.config.get<number>('SLA_THRESHOLD_SEC', DEFAULT_SLA_THRESHOLD_SEC);
  }

  async getQueueMetrics(): Promise<MetricasCola[]> {
    const [agentes, llamadas, colas] = await Promise.all([
      this.agenteRepo.find(),
      this.llamadaRepo.find(),
      this.colaRepo.find(),
    ]);

    const nombres = new Map(colas.map((c) => [c.id, c.nombre]));
    const idsColas = new Set<string>([
      ...colas.map((c) => c.id),
      ...agentes.flatMap((a) => a.colas ?? []),
      ...llamadas.map((c) => c.cola),
    ]);

    const now = Date.now();
    const metricas: MetricasCola[] = [];

    for (const id of [...idsColas].sort()) {
      const deLaCola = llamadas.filter((c) => c.cola === id);
      const enEspera = deLaCola.filter(
        (c) => c.estado === EstadoLlamada.EN_COLA,
      );
      const atendidas = deLaCola.filter(
        (c) =>
          c.estado === EstadoLlamada.CONECTADA ||
          c.estado === EstadoLlamada.FINALIZADA,
      );
      const abandonadas = deLaCola.filter(
        (c) => c.estado === EstadoLlamada.ABANDONADA,
      );
      const timbrando = deLaCola.filter(
        (c) => c.estado === EstadoLlamada.TIMBRANDO,
      );

      const esperas = atendidas
        .map((c) => c.tiempoEsperaSeg)
        .filter((w): w is number => w != null);

      const asaSeg =
        esperas.length > 0
          ? Math.round(esperas.reduce((sum, w) => sum + w, 0) / esperas.length)
          : null;

      const slaPct =
        esperas.length > 0
          ? Math.round(
              (esperas.filter((w) => w <= this.slaThresholdSec).length /
                esperas.length) *
                100,
            )
          : null;

      const esperaMaximaSeg =
        enEspera.length > 0
          ? Math.round(
              Math.max(
                ...enEspera.map((c) =>
                  c.marcasTiempo.incoming
                    ? now - Date.parse(c.marcasTiempo.incoming)
                    : 0,
                ),
              ) / 1000,
            )
          : 0;

      metricas.push({
        cola: id,
        nombre: nombres.get(id) ?? null,
        enEspera: enEspera.length,
        timbrando: timbrando.length,
        atendidas: atendidas.length,
        abandonadas: abandonadas.length,
        esperaMaximaSeg,
        asaSeg,
        slaPct,
      });
    }

    return metricas;
  }

  /** Snapshot liviano de llamadas activas para el tablero (orden FIFO). */
  async getActiveCalls(): Promise<Llamada[]> {
    const activas = await this.llamadaRepo.find({
      where: { estado: In([EstadoLlamada.EN_COLA, EstadoLlamada.TIMBRANDO]) },
    });
    return activas.sort(
      (a, b) =>
        Date.parse(a.marcasTiempo.incoming ?? '') -
        Date.parse(b.marcasTiempo.incoming ?? ''),
    );
  }
}
