import { describe, expect, it } from 'vitest';
import {
  EstadoAgente,
  assertTransition,
  puedeTransicionar,
  InvalidTransitionError,
  TOTAL_TRANSICIONES_VALIDAS,
  TRANSICIONES_VALIDAS,
} from './estado-agente.js';

const ALL_STATES = Object.values(EstadoAgente);

describe('Máquina de estados del agente (Requerimiento 2)', () => {
  it('define exactamente 11 transiciones válidas (10 del enunciado + TIMBRANDO->PAUSA del extra noanswer)', () => {
    expect(TOTAL_TRANSICIONES_VALIDAS).toBe(11);
  });

  it('TIMBRANDO -> PAUSA es válida: la exige el punto extra call.noanswer', () => {
    expect(puedeTransicionar(EstadoAgente.TIMBRANDO, EstadoAgente.PAUSA)).toBe(
      true,
    );
    expect(() => assertTransition(EstadoAgente.TIMBRANDO, EstadoAgente.PAUSA)).not.toThrow();
  });

  it('acepta las 10 transiciones válidas del enunciado', () => {
    for (const [desde, destinos] of Object.entries(TRANSICIONES_VALIDAS)) {
      for (const hacia of destinos) {
        expect(
          puedeTransicionar(desde as EstadoAgente, hacia),
          `${desde} -> ${hacia}`,
        ).toBe(true);
        expect(() =>
          assertTransition(desde as EstadoAgente, hacia),
        ).not.toThrow();
      }
    }
  });

  it('rechaza toda transición fuera de la tabla con InvalidTransitionError', () => {
    for (const desde of ALL_STATES) {
      for (const hacia of ALL_STATES) {
        if (puedeTransicionar(desde, hacia)) continue;
        expect(() => assertTransition(desde, hacia)).toThrow(
          InvalidTransitionError,
        );
        expect(() => assertTransition(desde, hacia)).toThrow(
          `Transición inválida: ${desde} -> ${hacia}`,
        );
      }
    }
  });

  it('OFFLINE solo puede pasar a DISPONIBLE', () => {
    expect(TRANSICIONES_VALIDAS[EstadoAgente.OFFLINE]).toEqual([
      EstadoAgente.DISPONIBLE,
    ]);
  });

  it('no se puede pausar desde OFFLINE', () => {
    expect(() =>
      assertTransition(EstadoAgente.OFFLINE, EstadoAgente.PAUSA),
    ).toThrow(InvalidTransitionError);
  });

  it('no se puede colgar y quedar DISPONIBLE: EN_LLAMADA solo lleva a WRAP_UP', () => {
    expect(() =>
      assertTransition(EstadoAgente.EN_LLAMADA, EstadoAgente.DISPONIBLE),
    ).toThrow(InvalidTransitionError);
    expect(() =>
      assertTransition(EstadoAgente.EN_LLAMADA, EstadoAgente.OFFLINE),
    ).toThrow(InvalidTransitionError);
  });

  it('no se puede timbrar de nuevo desde WRAP_UP', () => {
    expect(() =>
      assertTransition(EstadoAgente.WRAP_UP, EstadoAgente.TIMBRANDO),
    ).toThrow(InvalidTransitionError);
  });

  it('no se puede saltar de PAUSA a TIMBRANDO sin pasar por DISPONIBLE', () => {
    expect(() =>
      assertTransition(EstadoAgente.PAUSA, EstadoAgente.TIMBRANDO),
    ).toThrow(InvalidTransitionError);
  });

  it('no se puede pasar de DISPONIBLE a EN_LLAMADA sin timbrar', () => {
    expect(() =>
      assertTransition(EstadoAgente.DISPONIBLE, EstadoAgente.EN_LLAMADA),
    ).toThrow(InvalidTransitionError);
  });

  it('no hay auto-transiciones (un estado no lleva a sí mismo)', () => {
    for (const estado of ALL_STATES) {
      expect(() => assertTransition(estado, estado)).toThrow(
        InvalidTransitionError,
      );
    }
  });
});
