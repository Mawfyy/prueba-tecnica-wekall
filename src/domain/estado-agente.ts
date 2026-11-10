/**
 * Máquina de estados estricta del agente (Parte B - Requerimiento 2).
 *
 * Las 10 transiciones del enunciado:
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
export enum EstadoAgente {
  OFFLINE = 'OFFLINE',
  DISPONIBLE = 'DISPONIBLE',
  PAUSA = 'PAUSA',
  TIMBRANDO = 'TIMBRANDO',
  EN_LLAMADA = 'EN_LLAMADA',
  WRAP_UP = 'WRAP_UP',
}

export const TRANSICIONES_VALIDAS: Readonly<
  Record<EstadoAgente, readonly EstadoAgente[]>
> = {
  [EstadoAgente.OFFLINE]: [EstadoAgente.DISPONIBLE],
  [EstadoAgente.DISPONIBLE]: [
    EstadoAgente.OFFLINE,
    EstadoAgente.PAUSA,
    EstadoAgente.TIMBRANDO,
  ],
  [EstadoAgente.PAUSA]: [EstadoAgente.OFFLINE, EstadoAgente.DISPONIBLE],
  [EstadoAgente.TIMBRANDO]: [
    EstadoAgente.DISPONIBLE,
    EstadoAgente.EN_LLAMADA,
    // Requerida por el punto extra call.noanswer (ver doc del módulo).
    EstadoAgente.PAUSA,
  ],
  [EstadoAgente.EN_LLAMADA]: [EstadoAgente.WRAP_UP],
  [EstadoAgente.WRAP_UP]: [EstadoAgente.DISPONIBLE],
};

/** Total de aristas de la máquina (11). Se usa en los tests como invariant. */
export const TOTAL_TRANSICIONES_VALIDAS = Object.values(
  TRANSICIONES_VALIDAS,
).reduce((total, destinos) => total + destinos.length, 0);

export class InvalidTransitionError extends Error {
  constructor(
    readonly desde: EstadoAgente,
    readonly hacia: EstadoAgente,
  ) {
    super(`Transición inválida: ${desde} -> ${hacia}`);
    this.name = 'InvalidTransitionError';
  }
}

export function puedeTransicionar(desde: EstadoAgente, hacia: EstadoAgente): boolean {
  return TRANSICIONES_VALIDAS[desde].includes(hacia);
}

/**
 * Lanza `InvalidTransitionError` si la transición no está permitida.
 * Toda mutación de estado del agente pasa por aquí.
 */
export function assertTransition(desde: EstadoAgente, hacia: EstadoAgente): void {
  if (!puedeTransicionar(desde, hacia)) {
    throw new InvalidTransitionError(desde, hacia);
  }
}
