import { useRef, useState } from 'react';
import { Web } from 'sip.js';

// En sip.js 0.21 la API "simple" vive en el namespace Web de la entrada raíz.
const { SimpleUser } = Web;
type SimpleUserInstance = InstanceType<typeof SimpleUser>;
type SimpleUserDelegate = Web.SimpleUserDelegate;
type SimpleUserOptions = Web.SimpleUserOptions;

type PhoneStatus =
  | 'desconectado'
  | 'registrando'
  | 'registrado'
  | 'llamada-entrante'
  | 'en-llamada';

/**
 * WebPhone básico con sip.js (Punto Extra).
 *
 * Interfaz mínima para registrarse a un servidor SIP (dominio, usuario,
 * contraseña) con botones de Contestar y Colgar. En un entorno real el
 * servidor SIP debe soportar WebSocket (WSS) para WebRTC; sin servidor,
 * el componente muestra el error y queda listo para conectar.
 */
export function WebPhone() {
  const [server, setServer] = useState('');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<PhoneStatus>('desconectado');
  const [message, setMessage] = useState<string | null>(null);

  const simpleUserRef = useRef<SimpleUserInstance | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const delegate: SimpleUserDelegate = {
    onCallReceived: async () => {
      setStatus('llamada-entrante');
      setMessage('Llamada entrante…');
    },
    onCallAnswered: () => setStatus('en-llamada'),
    onCallHangup: () => setStatus('registrado'),
  };

  async function register() {
    if (!server || !user || !password) {
      setMessage('Completa dominio, usuario y contraseña.');
      return;
    }
    try {
      setStatus('registrando');
      setMessage(null);
      const options: SimpleUserOptions = {
        delegate,
        media: {
          remote: { audio: remoteAudioRef.current ?? undefined },
        },
        userAgentOptions: {
          authorizationUsername: user,
          authorizationPassword: password,
          displayName: user,
        },
      };
      const simple = new SimpleUser(`wss://${server}`, options);
      await simple.connect();
      await simple.register();
      simpleUserRef.current = simple;
      setStatus('registrado');
      setMessage(`Registrado como ${user}@${server}`);
    } catch (error) {
      simpleUserRef.current = null;
      setStatus('desconectado');
      setMessage(
        `No se pudo registrar: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async function answer() {
    try {
      await simpleUserRef.current?.answer();
      setStatus('en-llamada');
    } catch (error) {
      setMessage(
        `Error al contestar: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async function hangup() {
    try {
      await simpleUserRef.current?.hangup();
      setStatus('registrado');
      setMessage('Llamada finalizada.');
    } catch (error) {
      setMessage(
        `Error al colgar: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  const registered = status === 'registrado' || status === 'llamada-entrante' || status === 'en-llamada';

  return (
    <section className="panel webphone">
      <h2>WebPhone (SIP/WebRTC)</h2>
      <div className="webphone-form">
        <label>
          Dominio SIP
          <input
            value={server}
            onChange={(event) => setServer(event.target.value)}
            placeholder="pbx.ejemplo.com"
          />
        </label>
        <label>
          Usuario
          <input
            value={user}
            onChange={(event) => setUser(event.target.value)}
            placeholder="1001"
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button type="button" onClick={register} disabled={status === 'registrando'}>
          {registered ? 'Re-registrar' : 'Registrar'}
        </button>
      </div>

      <div className="webphone-call">
        <span className={`webphone-status status-${status}`}>{status}</span>
        <button
          type="button"
          onClick={answer}
          disabled={status !== 'llamada-entrante'}
        >
          Contestar
        </button>
        <button
          type="button"
          onClick={hangup}
          disabled={status !== 'en-llamada' && status !== 'llamada-entrante'}
        >
          Colgar
        </button>
      </div>

      {message && <p className="webphone-message">{message}</p>}
      <audio ref={remoteAudioRef} autoPlay />
    </section>
  );
}
