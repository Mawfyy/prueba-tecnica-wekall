/** Ciclo de vida de una llamada en la cola (ACD), según el modelo del PDF. */
export enum EstadoLlamada {
  /** Esperando ser asignada a un agente. */
  EN_COLA = 'EN_COLA',
  /** Asignada y sonando en el dispositivo del agente. */
  TIMBRANDO = 'TIMBRANDO',
  /** Contestada, agente en conversación. */
  CONECTADA = 'CONECTADA',
  /** Contestada y terminada (post hangup). */
  FINALIZADA = 'FINALIZADA',
  /** El cliente colgó antes de ser atendido (o superó tiempoMaximoEspera). */
  ABANDONADA = 'ABANDONADA',
}

/**
 * Marcas de tiempo del ciclo de vida de la llamada (modelo del PDF).
 * Solo se guardan las que ya ocurrieron: una llamada EN_COLA tiene solo
 * `incoming`; una ABANDONADA en cola tiene `incoming` + `abandoned`.
 */
export interface MarcasTiempo {
  /** Entrada a la cola (evento call.received). Define el orden FIFO. */
  incoming?: string;
  /** Asignada a un agente: empieza a sonar en su dispositivo. */
  ringing?: string;
  /** Contestada (evento call.answered). Base del ASA y del SLA. */
  connected?: string;
  /** Finalizada por el agente o el cliente tras ser atendida. */
  ended?: string;
  /** Abandonada (cliente colgó o superó el tiempo máximo de espera). */
  abandoned?: string;
}
