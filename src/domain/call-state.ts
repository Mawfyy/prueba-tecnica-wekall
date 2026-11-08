/** Ciclo de vida de una llamada en la cola (ACD). */
export enum CallState {
  /** Esperando ser asignada a un agente. */
  EN_COLA = 'EN_COLA',
  /** Asignada y sonando en el dispositivo del agente. */
  TIMBRANDO = 'TIMBRANDO',
  /** Contestada, agente en conversación. */
  ATENDIDA = 'ATENDIDA',
  /** Contestada y terminada (post hangup). */
  FINALIZADA = 'FINALIZADA',
  /** El cliente colgó antes de ser atendido (o superó maxWaitTimeSec). */
  ABANDONADA = 'ABANDONADA',
}
