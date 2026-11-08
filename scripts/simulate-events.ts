/**
 * Script de simulación (Entregable): envía a `POST /events` la secuencia de
 * prueba del enunciado para ver el tablero moverse en vivo.
 *
 * Uso:
 *   npm run simulate
 *   API_URL=http://localhost:3000 DELAY_MS=1500 npm run simulate
 *
 * Requiere el backend corriendo (docker compose up o npm run start:dev).
 */

const BASE_URL = process.env.API_URL ?? 'http://localhost:3000';
const DELAY_MS = Number(process.env.DELAY_MS ?? 2000);

/**
 * Prefijo único por corrida: permite ejecutar el script varias veces sin que
 * la idempotencia del backend descarte todo como duplicado. La demo del
 * duplicado se mantiene reenviando el mismo eventId dentro de la corrida.
 */
const RUN_ID = Date.now().toString(36);
const eid = (n: number) => `e-${RUN_ID}-${String(n).padStart(3, '0')}`;
const cid = (n: number) => `call-${RUN_ID}-${String(n).padStart(3, '0')}`;

interface EventResponse {
  eventId: string;
  status: 'processed' | 'duplicate' | 'ignored';
  reason?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function send(
  eventId: string,
  type: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const response = await fetch(`${BASE_URL}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventId,
      type,
      timestamp: new Date().toISOString(),
      payload,
    }),
  });
  if (!response.ok) {
    console.error(`✗ ${eventId} ${type} -> HTTP ${response.status}`);
    console.error(await response.text());
    return;
  }
  const result = (await response.json()) as EventResponse;
  const badge =
    result.status === 'processed'
      ? '✓'
      : result.status === 'duplicate'
        ? '⏭ (duplicado)'
        : `⚠ ignorado: ${result.reason ?? ''}`;
  console.log(`${badge} ${eventId} ${type} ${JSON.stringify(payload)}`);
}

/** Consulta qué agente está timbrando una llamada (el motor lo asignó). */
async function agentOfCall(callId: string): Promise<string | null> {
  const response = await fetch(`${BASE_URL}/calls`);
  const calls = (await response.json()) as Array<{
    id: string;
    agentId: string | null;
  }>;
  return calls.find((call) => call.id === callId)?.agentId ?? null;
}

async function main(): Promise<void> {
  console.log(`Simulando contra ${BASE_URL} (pausa de ${DELAY_MS}ms entre eventos)\n`);

  // --- 1. Los agentes entran en línea -------------------------------------
  await send(eid(1), 'agent.login', { agentId: 'AG-1001' });
  await sleep(DELAY_MS);
  await send(eid(2), 'agent.login', { agentId: 'AG-1002' });
  await sleep(DELAY_MS);
  await send(eid(3), 'agent.login', { agentId: 'AG-1003' });
  await sleep(DELAY_MS);
  await send(eid(4), 'agent.login', { agentId: 'AG-1004' });
  await sleep(DELAY_MS);

  // --- 2. Idempotencia: el mismo eventId reenviado -------------------------
  console.log(`— Reenvío de ${eid(4)} (debe descartarse como duplicado) —`);
  await send(eid(4), 'agent.login', { agentId: 'AG-1004' });
  await sleep(DELAY_MS);

  // --- 3. Entra una llamada a ventas y otra a soporte ----------------------
  await send(eid(5), 'call.received', { callId: cid(1), queue: 'ventas' });
  await sleep(DELAY_MS);
  await send(eid(6), 'call.received', { callId: cid(2), queue: 'soporte' });
  await sleep(DELAY_MS);

  // --- 4. El cliente de la llamada 1 contesta ------------------------------
  const agent1 = (await agentOfCall(cid(1))) ?? 'AG-1001';
  await send(eid(7), 'call.answered', { callId: cid(1), agentId: agent1 });
  await sleep(DELAY_MS);

  // --- 5. Otra llamada a ventas: queda EN_COLA (no hay agentes libres) -----
  await send(eid(8), 'call.received', { callId: cid(3), queue: 'ventas' });
  await sleep(DELAY_MS);

  // --- 6. Termina la llamada 1: el agente entra en WRAP_UP (15s) -----------
  await send(eid(9), 'call.hangup', { callId: cid(1) });
  console.log('— Esperando 16s: el agente debe salir solo de WRAP_UP —');
  await sleep(16_000);

  // --- 7. call.noanswer: agente a PAUSA "No contesta", llamada al inicio ---
  const agent3 = (await agentOfCall(cid(3))) ?? 'AG-1001';
  await send(eid(10), 'call.noanswer', { callId: cid(3), agentId: agent3 });
  await sleep(DELAY_MS);

  // --- 8. El supervisor despausa al agente y atiende la llamada ------------
  await send(eid(11), 'agent.unpause', { agentId: agent3 });
  await sleep(DELAY_MS);
  const agent3b = (await agentOfCall(cid(3))) ?? agent3;
  await send(eid(12), 'call.answered', { callId: cid(3), agentId: agent3b });
  await sleep(DELAY_MS);

  // --- 9. Se cierran las llamadas 2 y 3 ------------------------------------
  await send(eid(13), 'call.hangup', { callId: cid(2) });
  await sleep(DELAY_MS);
  await send(eid(14), 'call.hangup', { callId: cid(3) });
  await sleep(DELAY_MS);

  // --- 10. Resiliencia: evento de una llamada que no existe ----------------
  console.log('— Resiliencia: call.answered de una llamada inexistente —');
  await send(eid(15), 'call.answered', {
    callId: `call-${RUN_ID}-inexistente`,
    agentId: 'AG-1001',
  });
  await sleep(DELAY_MS);

  // --- 11. Llamada a facturación -------------------------------------------
  await send(eid(16), 'call.received', {
    callId: cid(4),
    queue: 'facturacion',
  });
  await sleep(DELAY_MS);
  await send(eid(17), 'call.hangup', { callId: cid(4) });
  await sleep(DELAY_MS);

  // --- 12. Última llamada: se cierra limpia para no dejar agentes colgados -
  await send(eid(18), 'call.received', { callId: cid(5), queue: 'ventas' });
  await sleep(DELAY_MS);
  const agent5 = await agentOfCall(cid(5));
  if (agent5) {
    // Fue asignada: contestar y colgar para dejar el tablero en estado limpio.
    await send(eid(19), 'call.answered', { callId: cid(5), agentId: agent5 });
    await sleep(DELAY_MS);
    await send(eid(20), 'call.hangup', { callId: cid(5) });
  } else {
    // Quedó EN_COLA: si supera MAX_WAIT_TIME_SEC el cron la marca ABANDONADA.
    console.log(
      `— ${cid(5)} queda EN_COLA: si supera MAX_WAIT_TIME_SEC el cron la marca ABANDONADA —`,
    );
  }

  console.log('\nSimulación terminada. Revisa el tablero y GET /queues.');
}

main().catch((error) => {
  console.error('La simulación falló:', error);
  process.exitCode = 1;
});
