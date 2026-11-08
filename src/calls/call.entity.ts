import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { CallState } from '../domain/call-state.js';

@Entity('calls')
export class Call {
  /** callId que llega en el evento (ej. "call-001"). */
  @PrimaryColumn('text')
  id!: string;

  @Column('text')
  queue!: string;

  @Index()
  @Column('text', { default: CallState.EN_COLA })
  state!: CallState;

  /**
   * Momento de entrada a la cola. Define el orden FIFO.
   * En `call.noanswer` la llamada vuelve al inicio de la cola conservando
   * este timestamp original (es la más vieja, queda primera).
   */
  @Column('timestamptz')
  enqueuedAt!: Date;

  @Column('timestamptz', { nullable: true })
  assignedAt!: Date | null;

  @Column('timestamptz', { nullable: true })
  answeredAt!: Date | null;

  @Column('timestamptz', { nullable: true })
  endedAt!: Date | null;

  @Column('text', { nullable: true })
  agentId!: string | null;

  /** Segundos entre enqueuedAt y answeredAt. Base del ASA y del SLA. */
  @Column('int', { nullable: true })
  waitTimeSec!: number | null;

  /** Segundos entre answeredAt y endedAt. */
  @Column('int', { nullable: true })
  talkTimeSec!: number | null;
}
