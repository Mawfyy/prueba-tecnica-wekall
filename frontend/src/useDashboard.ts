import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { DashboardSnapshot } from './types.js';
import { apiUrl } from './api.js';

/**
 * Conexión Socket.io con el backend.
 *
 * Resincronización silenciosa (Punto Extra): al reconectar, el gateway
 * reenvía `dashboard:snapshot` y simplemente reemplazamos el estado, sin
 * recargar la página. Mientras está desconectado, `connected` es false y
 * la UI muestra el indicador.
 */
export function useDashboard(): {
  snapshot: DashboardSnapshot | null;
  connected: boolean;
} {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket: Socket = io(apiUrl, {
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));
    socket.on('dashboard:snapshot', setSnapshot);
    socket.on('dashboard:state', setSnapshot);

    return () => {
      socket.close();
    };
  }, []);

  return { snapshot, connected };
}
