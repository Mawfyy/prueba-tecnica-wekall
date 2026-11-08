import { useState } from 'react';
import { useDashboard } from './useDashboard.js';
import { pauseAgent, unpauseAgent } from './api.js';
import { AgentCard } from './components/AgentCard.js';
import { QueuePanel } from './components/QueuePanel.js';
import { WebPhone } from './components/WebPhone.js';
import { ConnectionBanner } from './components/ConnectionBanner.js';

export default function App() {
  const { snapshot, connected } = useDashboard();
  const [error, setError] = useState<string | null>(null);

  async function handlePause(agentId: string) {
    try {
      await pauseAgent(agentId);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleUnpause(agentId: string) {
    try {
      await unpauseAgent(agentId);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <h1>WeKall · Squad Poseidon</h1>
        <p>Tablero de agentes y colas en tiempo real</p>
      </header>

      <ConnectionBanner connected={connected} />
      {error && <div className="error-banner">{error}</div>}

      {snapshot ? (
        <>
          <section className="agent-grid">
            {snapshot.agents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onPause={handlePause}
                onUnpause={handleUnpause}
              />
            ))}
          </section>
          <QueuePanel queues={snapshot.queues} calls={snapshot.calls} />
        </>
      ) : (
        <p className="loading">Esperando el primer snapshot del servidor…</p>
      )}

      <WebPhone />
    </main>
  );
}
