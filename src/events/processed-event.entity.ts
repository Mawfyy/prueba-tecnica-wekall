import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Registro de eventos ya procesados: garantiza idempotencia de `POST /events`.
 * El `eventId` es la clave primaria, así que un INSERT repetido falla por
 * clave duplicada y el evento se descarta.
 */
@Entity('processed_events')
export class ProcessedEvent {
  @PrimaryColumn('text')
  eventId!: string;

  @Column('timestamptz', { default: () => 'now()' })
  processedAt!: Date;
}
