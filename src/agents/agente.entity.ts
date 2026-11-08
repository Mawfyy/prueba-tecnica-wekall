import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { EstadoAgente } from '../domain/estado-agente.js';

/**
 * Entidad `Agente` del modelo oficial del PDF.
 *
 * Los campos internos (`libreDesde`, `motivoPausa`, `posgestionHasta`) no
 * aparecen en el PDF: son mecánica del motor de asignación (idle-max) y de
 * la posgestión obligatoria, y se persisten para sobrevivir reinicios.
 */
@Entity('agentes')
export class Agente {
  /** Identificador de negocio, ej. "AG-1001". Lo proveen los eventos. */
  @PrimaryColumn('text')
  id!: string;

  @Column('text')
  nombre!: string;

  @Column('text')
  extension!: string;

  /** Colas que el agente atiende, ej. ['ventas', 'soporte']. */
  @Column('text', { array: true })
  colas!: string[];

  @Index()
  @Column('text', { default: EstadoAgente.OFFLINE })
  estado!: EstadoAgente;

  /** Referencia para el cronómetro mm:ss del dashboard. */
  @Column('timestamptz', { default: () => 'now()' })
  horaEntradaEstado!: Date;

  /**
   * Se marca al entrar en DISPONIBLE y se limpia al salir.
   * El motor de asignación usa el libreDesde más antiguo (idle max).
   */
  @Column('timestamptz', { nullable: true })
  libreDesde!: Date | null;

  @Column('text', { nullable: true })
  motivoPausa!: string | null;

  /**
   * Momento en el que el agente debe salir de WRAP_UP (ahora + 15s).
   * El sweeper del cron lo promueve a DISPONIBLE cuando vence.
   */
  @Column('timestamptz', { nullable: true })
  posgestionHasta!: Date | null;
}
