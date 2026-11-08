import type { Call, QueueMetrics } from '../types.js';

interface QueuePanelProps {
  queues: QueueMetrics[];
  calls: Call[];
}

/** Panel de colas con métricas avanzadas: ASA y SLA (Punto Extra). */
export function QueuePanel({ queues, calls }: QueuePanelProps) {
  return (
    <section className="panel">
      <h2>Colas</h2>
      <table className="queue-table">
        <thead>
          <tr>
            <th>Cola</th>
            <th>En espera</th>
            <th>Timbrando</th>
            <th>Atendidas</th>
            <th>Abandonadas</th>
            <th>Espera máx.</th>
            <th>ASA</th>
            <th>SLA (20s)</th>
          </tr>
        </thead>
        <tbody>
          {queues.map((queue) => (
            <tr key={queue.queue}>
              <td>{queue.queue}</td>
              <td>{queue.waiting}</td>
              <td>{queue.ringing}</td>
              <td>{queue.answered}</td>
              <td>{queue.abandoned}</td>
              <td>{queue.maxWaitTimeSec}s</td>
              <td>{queue.asaSec == null ? '—' : `${queue.asaSec}s`}</td>
              <td>{queue.slaPct == null ? '—' : `${queue.slaPct}%`}</td>
            </tr>
          ))}
          {queues.length === 0 && (
            <tr>
              <td colSpan={8}>Sin datos todavía…</td>
            </tr>
          )}
        </tbody>
      </table>

      <h3>Llamadas activas</h3>
      <ul className="active-calls">
        {calls.map((call) => (
          <li key={call.id}>
            <strong>{call.id}</strong> · cola {call.queue} · {call.state}
            {call.agentId ? ` · agente ${call.agentId}` : ''}
          </li>
        ))}
        {calls.length === 0 && <li>No hay llamadas activas.</li>}
      </ul>
    </section>
  );
}
