import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { EstadoLlamada, type MarcasTiempo } from '../domain/estado-llamada.js';

/**
 * Entidad `Llamada` del modelo oficial del PDF.
 *
 * Extensiones internas necesarias para el ACD (no aparecen en el PDF):
 * - `agenteId`: a quién se asignó (el motor de asignación la escribe).
 * - `tiempoEsperaSeg` / `tiempoConversacionSeg`: base del ASA y del SLA.
 */
@Entity('llamadas')
export class Llamada {
  /** callId que llega en el evento (ej. "call-001"). */
  @PrimaryColumn('text')
  id!: string;

  /** Número del cliente que llama (payload del PBX). */
  @Column('text', { default: 'desconocido' })
  numeroOrigen!: string;

  @Column('text')
  cola!: string;

  @Index()
  @Column('text', { default: EstadoLlamada.EN_COLA })
  estado!: EstadoLlamada;

  /** Ciclo de vida: incoming / ringing / connected / ended / abandoned. */
  @Column('jsonb', { default: {} })
  marcasTiempo!: MarcasTiempo;

  @Column('text', { nullable: true })
  agenteId!: string | null;

  /** Segundos entre marcasTiempo.incoming y marcasTiempo.connected. */
  @Column('int', { nullable: true })
  tiempoEsperaSeg!: number | null;

  /** Segundos entre marcasTiempo.connected y marcasTiempo.ended. */
  @Column('int', { nullable: true })
  tiempoConversacionSeg!: number | null;
}
