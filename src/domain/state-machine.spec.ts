import { describe, expect, it } from 'vitest';
import {
  AgentState,
  assertTransition,
  canTransition,
  InvalidTransitionError,
  TOTAL_VALID_TRANSITIONS,
  VALID_TRANSITIONS,
} from './agent-state.js';

const ALL_STATES = Object.values(AgentState);

describe('Máquina de estados del agente (Requerimiento 2)', () => {
  it('define exactamente 10 transiciones válidas', () => {
    expect(TOTAL_VALID_TRANSITIONS).toBe(10);
  });

  it('acepta las 10 transiciones válidas del enunciado', () => {
    for (const [from, targets] of Object.entries(VALID_TRANSITIONS)) {
      for (const to of targets) {
        expect(canTransition(from as AgentState, to), `${from} -> ${to}`).toBe(
          true,
        );
        expect(() =>
          assertTransition(from as AgentState, to),
        ).not.toThrow();
      }
    }
  });

  it('rechaza toda transición fuera de la tabla con InvalidTransitionError', () => {
    for (const from of ALL_STATES) {
      for (const to of ALL_STATES) {
        if (canTransition(from, to)) continue;
        expect(() => assertTransition(from, to)).toThrow(
          InvalidTransitionError,
        );
        expect(() => assertTransition(from, to)).toThrow(
          `Transición inválida: ${from} -> ${to}`,
        );
      }
    }
  });

  it('OFFLINE solo puede pasar a DISPONIBLE', () => {
    expect(VALID_TRANSITIONS[AgentState.OFFLINE]).toEqual([
      AgentState.DISPONIBLE,
    ]);
  });

  it('no se puede pausar desde OFFLINE', () => {
    expect(() =>
      assertTransition(AgentState.OFFLINE, AgentState.PAUSA),
    ).toThrow(InvalidTransitionError);
  });

  it('no se puede colgar y quedar DISPONIBLE: EN_LLAMADA solo lleva a WRAP_UP', () => {
    expect(() =>
      assertTransition(AgentState.EN_LLAMADA, AgentState.DISPONIBLE),
    ).toThrow(InvalidTransitionError);
    expect(() =>
      assertTransition(AgentState.EN_LLAMADA, AgentState.OFFLINE),
    ).toThrow(InvalidTransitionError);
  });

  it('no se puede timbrar de nuevo desde WRAP_UP', () => {
    expect(() =>
      assertTransition(AgentState.WRAP_UP, AgentState.TIMBRANDO),
    ).toThrow(InvalidTransitionError);
  });

  it('no se puede saltar de PAUSA a TIMBRANDO sin pasar por DISPONIBLE', () => {
    expect(() =>
      assertTransition(AgentState.PAUSA, AgentState.TIMBRANDO),
    ).toThrow(InvalidTransitionError);
  });

  it('no se puede pasar de DISPONIBLE a EN_LLAMADA sin timbrar', () => {
    expect(() =>
      assertTransition(AgentState.DISPONIBLE, AgentState.EN_LLAMADA),
    ).toThrow(InvalidTransitionError);
  });

  it('no hay auto-transiciones (un estado no lleva a sí mismo)', () => {
    for (const state of ALL_STATES) {
      expect(() => assertTransition(state, state)).toThrow(
        InvalidTransitionError,
      );
    }
  });
});
