const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  'http://localhost:3000';

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`HTTP ${response.status}: ${detail}`);
  }
  return (await response.json()) as T;
}

export function pauseAgent(agentId: string, reason?: string) {
  return post<{ ok: boolean }>('/agents/pause', { agentId, reason });
}

export function unpauseAgent(agentId: string) {
  return post<{ ok: boolean }>('/agents/unpause', { agentId });
}

export const apiUrl = API_URL;
