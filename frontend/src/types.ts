/**
 * Modelo de datos espejo del backend: entidades oficiales del PDF de WeKall
 * (Agente, Cola, Llamada) más las métricas derivadas del panel de colas.
 */

export type EstadoAgente =
  | 'OFFLINE'
  | 'DISPONIBLE'
  | 'PAUSA'
  | 'TIMBRANDO'
  | 'EN_LLAMADA'
  | 'WRAP_UP';

export type EstadoLlamada =
  | 'EN_COLA'
  | 'TIMBRANDO'
  | 'CONECTADA'
  | 'FINALIZADA'
  | 'ABANDONADA';

/** Entidad `Agente` del PDF. */
export interface Agente {
  id: string;
  nombre: string;
  extension: string;
  colas: string[];
  estado: EstadoAgente;
  horaEntradaEstado: string;
  /** Campos internos del motor (no están en el PDF pero llegan en el snapshot). */
  libreDesde: string | null;
  motivoPausa: string | null;
  posgestionHasta: string | null;
}

/** Entidad `Cola` del PDF. */
export interface Cola {
  id: string;
  nombre: string;
  tiempoMaximoEspera: number;
}

/** Marcas de tiempo del ciclo de vida de la `Llamada` (solo las ocurridas). */
export interface MarcasTiempo {
  incoming?: string;
  ringing?: string;
  connected?: string;
  ended?: string;
  abandoned?: string;
}

/** Entidad `Llamada` del PDF (+ campos internos del ACD). */
export interface Llamada {
  id: string;
  numeroOrigen: string;
  cola: string;
  estado: EstadoLlamada;
  marcasTiempo: MarcasTiempo;
  agenteId: string | null;
  tiempoEsperaSeg: number | null;
  tiempoConversacionSeg: number | null;
}

/** Métricas por cola (GET /queues y snapshot del tablero). */
export interface MetricasCola {
  cola: string;
  nombre: string | null;
  enEspera: number;
  timbrando: number;
  atendidas: number;
  abandonadas: number;
  esperaMaximaSeg: number;
  asaSeg: number | null;
  slaPct: number | null;
}

export interface DashboardSnapshot {
  serverTime: string;
  agentes: Agente[];
  colas: MetricasCola[];
  llamadas: Llamada[];
}
