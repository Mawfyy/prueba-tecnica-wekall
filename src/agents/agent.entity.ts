import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { AgentState } from '../domain/agent-state.js';

@Entity('agents')
export class Agent {
  /** Identificador de negocio, ej. "AG-1001". Lo proveen los eventos. */
  @PrimaryColumn('text')
  id!: string;

  @Column('text')
  name!: string;

  @Column('text')
  extension!: string;

  /** Colas que el agente atiende, ej. ['ventas', 'soporte']. */
  @Column('text', { array: true })
  queues!: string[];

  @Index()
  @Column('text', { default: AgentState.OFFLINE })
  state!: AgentState;

  /** Referencia para el cronómetro mm:ss del dashboard. */
  @Column('timestamptz', { default: () => 'now()' })
  stateChangedAt!: Date;

  /**
   * Se marca al entrar en DISPONIBLE y se limpia al salir.
   * El motor de asignación usa el idleSince más antiguo (idle max).
   */
  @Column('timestamptz', { nullable: true })
  idleSince!: Date | null;

  @Column('text', { nullable: true })
  pauseReason!: string | null;

  /**
   * Momento en el que el agente debe salir de WRAP_UP (ahora + 15s).
   * El sweeper del cron lo promueve a DISPONIBLE cuando vence.
   */
  @Column('timestamptz', { nullable: true })
  wrapUpUntil!: Date | null;
}
