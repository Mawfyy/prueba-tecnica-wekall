/**
 * Máquina de estados estricta del agente (Parte B - Requerimiento 2).
 *
 * Las 10 únicas transiciones válidas:
 *
 *   1.  OFFLINE     -> DISPONIBLE
 *   2.  DISPONIBLE  -> OFFLINE
 *   3.  DISPONIBLE  -> PAUSA
 *   4.  PAUSA       -> DISPONIBLE
 *   5.  PAUSA       -> OFFLINE
 *   6.  DISPONIBLE  -> TIMBRANDO
 *   7.  TIMBRANDO   -> DISPONIBLE
 *   8.  TIMBRANDO   -> EN_LLAMADA
 *   9.  EN_LLAMADA  -> WRAP_UP
 *   10. WRAP_UP     -> DISPONIBLE
 *
 * Cualquier otra transición debe ser rechazada con `InvalidTransitionError`.
 */
export enum AgentState {
  OFFLINE = 'OFFLINE',
  DISPONIBLE = 'DISPONIBLE',
  PAUSA = 'PAUSA',
  TIMBRANDO = 'TIMBRANDO',
  EN_LLAMADA = 'EN_LLAMADA',
  WRAP_UP = 'WRAP_UP',
}

export const VALID_TRANSITIONS: Readonly<
  Record<AgentState, readonly AgentState[]>
> = {
  [AgentState.OFFLINE]: [AgentState.DISPONIBLE],
  [AgentState.DISPONIBLE]: [
    AgentState.OFFLINE,
    AgentState.PAUSA,
    AgentState.TIMBRANDO,
  ],
  [AgentState.PAUSA]: [AgentState.OFFLINE, AgentState.DISPONIBLE],
  [AgentState.TIMBRANDO]: [AgentState.DISPONIBLE, AgentState.EN_LLAMADA],
  [AgentState.EN_LLAMADA]: [AgentState.WRAP_UP],
  [AgentState.WRAP_UP]: [AgentState.DISPONIBLE],
};

/** Total de aristas de la máquina (10). Se usa en los tests como invariant. */
export const TOTAL_VALID_TRANSITIONS = Object.values(VALID_TRANSITIONS).reduce(
  (total, targets) => total + targets.length,
  0,
);

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: AgentState,
    readonly to: AgentState,
  ) {
    super(`Transición inválida: ${from} -> ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export function canTransition(from: AgentState, to: AgentState): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

/**
 * Lanza `InvalidTransitionError` si la transición no está permitida.
 * Toda mutación de estado del agente pasa por aquí.
 */
export function assertTransition(from: AgentState, to: AgentState): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}
