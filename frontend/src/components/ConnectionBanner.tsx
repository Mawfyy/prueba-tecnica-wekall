interface ConnectionBannerProps {
  connected: boolean;
}

/** Indicador de desconexión + resincronización silenciosa (Punto Extra). */
export function ConnectionBanner({ connected }: ConnectionBannerProps) {
  if (connected) {
    return (
      <div className="connection-banner connected">
        ● En vivo — sincronizado por WebSockets
      </div>
    );
  }
  return (
    <div className="connection-banner disconnected">
      ● Desconectado — reconectando y resincronizando automáticamente…
    </div>
  );
}
