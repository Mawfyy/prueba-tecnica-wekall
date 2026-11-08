import { useEffect, useState } from 'react';
import type { Agent, AgentState } from '../types.js';

/** Código de colores por estado (Requerimiento 6). */
const STATE_STYLES: Record<AgentState, { label: string; className: string }> = {
  OFFLINE: { label: 'Desconectado', className: 'state-offline' },
  DISPONIBLE: { label: 'Disponible', className: 'state-disponible' },
  PAUSA: { label: 'Pausa', className: 'state-pausa' },
  TIMBRANDO: { label: 'Timbrando', className: 'state-timbrando' },
  EN_LLAMADA: { label: 'En llamada', className: 'state-en-llamada' },
  WRAP_UP: { label: 'Wrap-up', className: 'state-wrap-up' },
};

function formatElapsed(fromIso: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(fromIso)) / 1000));
  const mm = String(Math.floor(seconds / 60) % 60).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  const hours = Math.floor(seconds / 3600);
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${mm}:${ss}`
    : `${mm}:${ss}`;
}

/** Cronómetro mm:ss basado en stateChangedAt, actualizado cada segundo. */
function useElapsed(stateChangedAt: string): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return formatElapsed(stateChangedAt, now);
}

interface AgentCardProps {
  agent: Agent;
  onPause: (agentId: string) => void;
  onUnpause: (agentId: string) => void;
}

export function AgentCard({ agent, onPause, onUnpause }: AgentCardProps) {
  const elapsed = useElapsed(agent.stateChangedAt);
  const style = STATE_STYLES[agent.state];

  return (
    <article className={`agent-card ${style.className}`}>
      <header>
        <div>
          <h3>{agent.name}</h3>
          <span className="agent-meta">
            {agent.id} · Ext. {agent.extension}
          </span>
        </div>
        <span className="agent-state-badge">{style.label}</span>
      </header>

      <div className="agent-timer" title="Tiempo en el estado actual">
        ⏱ {elapsed}
      </div>

      <div className="agent-queues">
        {agent.queues.map((queue) => (
          <span key={queue} className="queue-chip">
            {queue}
          </span>
        ))}
      </div>

      {agent.state === 'PAUSA' && agent.pauseReason && (
        <p className="agent-pause-reason">Motivo: {agent.pauseReason}</p>
      )}

      {/* Botones de supervisor (Punto Extra) */}
      <footer className="agent-actions">
        <button
          type="button"
          disabled={agent.state !== 'DISPONIBLE'}
          onClick={() => onPause(agent.id)}
        >
          Pausar
        </button>
        <button
          type="button"
          disabled={agent.state !== 'PAUSA'}
          onClick={() => onUnpause(agent.id)}
        >
          Despausar
        </button>
      </footer>
    </article>
  );
}
