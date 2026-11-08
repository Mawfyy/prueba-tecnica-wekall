import { useEffect, useState } from 'react';
import type { Agente, EstadoAgente } from '../types.js';

/** Código de colores por estado (Requerimiento 6). */
const STATE_STYLES: Record<EstadoAgente, { label: string; className: string }> = {
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

/** Cronómetro mm:ss basado en horaEntradaEstado, actualizado cada segundo. */
function useElapsed(horaEntradaEstado: string): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return formatElapsed(horaEntradaEstado, now);
}

interface AgentCardProps {
  agente: Agente;
  onPause: (agenteId: string) => void;
  onUnpause: (agenteId: string) => void;
}

export function AgentCard({ agente, onPause, onUnpause }: AgentCardProps) {
  const elapsed = useElapsed(agente.horaEntradaEstado);
  const style = STATE_STYLES[agente.estado];

  return (
    <article className={`agent-card ${style.className}`}>
      <header>
        <div>
          <h3>{agente.nombre}</h3>
          <span className="agent-meta">
            {agente.id} · Ext. {agente.extension}
          </span>
        </div>
        <span className="agent-state-badge">{style.label}</span>
      </header>

      <div className="agent-timer" title="Tiempo en el estado actual">
        ⏱ {elapsed}
      </div>

      <div className="agent-queues">
        {agente.colas.map((cola) => (
          <span key={cola} className="queue-chip">
            {cola}
          </span>
        ))}
      </div>

      {agente.estado === 'PAUSA' && agente.motivoPausa && (
        <p className="agent-pause-reason">Motivo: {agente.motivoPausa}</p>
      )}

      {/* Botones de supervisor (Punto Extra) */}
      <footer className="agent-actions">
        <button
          type="button"
          disabled={agente.estado !== 'DISPONIBLE'}
          onClick={() => onPause(agente.id)}
        >
          Pausar
        </button>
        <button
          type="button"
          disabled={agente.estado !== 'PAUSA'}
          onClick={() => onUnpause(agente.id)}
        >
          Despausar
        </button>
      </footer>
    </article>
  );
}
