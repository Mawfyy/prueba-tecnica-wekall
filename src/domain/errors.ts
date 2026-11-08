/**
 * Error de dominio para datos inconsistentes (Requerimiento 4 - Resiliencia):
 * eventos que llegan tarde, referencias a llamadas/agentes inexistentes, etc.
 * Se registra en log y se ignora el evento sin romper el servicio.
 */
export class InconsistencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InconsistencyError';
  }
}
