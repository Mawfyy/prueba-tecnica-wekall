import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Entidad `Cola` del modelo oficial del PDF.
 *
 * El `id` es el nombre corto que traen los eventos del PBX ("ventas"),
 * y `nombre` es la etiqueta de presentación ("Ventas").
 * `tiempoMaximoEspera` (segundos) alimenta el worker de abandono: una
 * llamada EN_COLA que lo supere pasa a ABANDONADA.
 */
@Entity('colas')
export class Cola {
  @PrimaryColumn('text')
  id!: string;

  @Column('text')
  nombre!: string;

  @Column('int')
  tiempoMaximoEspera!: number;
}
