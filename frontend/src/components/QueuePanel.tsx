import type { Llamada, MetricasCola } from '../types.js';

interface QueuePanelProps {
  colas: MetricasCola[];
  llamadas: Llamada[];
}

/** Panel de colas con métricas avanzadas: ASA y SLA (Punto Extra). */
export function QueuePanel({ colas, llamadas }: QueuePanelProps) {
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
          {colas.map((metrica) => (
            <tr key={metrica.cola}>
              <td>{metrica.nombre ?? metrica.cola}</td>
              <td>{metrica.enEspera}</td>
              <td>{metrica.timbrando}</td>
              <td>{metrica.atendidas}</td>
              <td>{metrica.abandonadas}</td>
              <td>{metrica.esperaMaximaSeg}s</td>
              <td>{metrica.asaSeg == null ? '—' : `${metrica.asaSeg}s`}</td>
              <td>{metrica.slaPct == null ? '—' : `${metrica.slaPct}%`}</td>
            </tr>
          ))}
          {colas.length === 0 && (
            <tr>
              <td colSpan={8}>Sin datos todavía…</td>
            </tr>
          )}
        </tbody>
      </table>

      <h3>Llamadas activas</h3>
      <ul className="active-calls">
        {llamadas.map((llamada) => (
          <li key={llamada.id}>
            <strong>{llamada.id}</strong> · {llamada.numeroOrigen} · cola{' '}
            {llamada.cola} · {llamada.estado}
            {llamada.agenteId ? ` · agente ${llamada.agenteId}` : ''}
          </li>
        ))}
        {llamadas.length === 0 && <li>No hay llamadas activas.</li>}
      </ul>
    </section>
  );
}
