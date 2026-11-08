# WeKall · Squad Poseidon — Prueba Técnica (Parte B)

Mini-plataforma de Contact Center: motor de colas (ACD) con máquina de estados
de agente, asignación concurrente FIFO + Idle-Max, ingesta de eventos
idempotente, tablero en vivo en React y WebPhone SIP.

- **Backend:** Node 20+, NestJS 12 (TypeScript, ESM), TypeORM, PostgreSQL, Socket.io, `@nestjs/schedule`, `async-mutex`.
- **Frontend:** React 19 + TypeScript + Vite, `socket.io-client`, `sip.js`.
- **Infraestructura:** Docker Compose (PostgreSQL + Backend + Frontend con un solo comando).

---

## 1. Cómo correr

### Con Docker (todo junto)

```bash
docker compose up
# PostgreSQL   -> localhost:5432 (wekall/wekall, db wekall)
# Backend API  -> http://localhost:3000
# Dashboard    -> http://localhost:5173
```

La primera vez compila las imágenes (`docker compose up --build` si hace
falta). El backend aplica `synchronize: true` de TypeORM, así que las tablas
se crean solas y el seed inserta 4 agentes (`AG-1001`…`AG-1004`, todos
`OFFLINE`).

### Desarrollo local

```bash
# 1. Base de datos
docker compose up db

# 2. Backend
cp .env.example .env
npm install
npm run start:dev

# 3. Frontend (otra terminal)
cd frontend
npm install
npm run dev
```

### Simular la secuencia del enunciado

```bash
npm run simulate
# o: API_URL=http://localhost:3000 DELAY_MS=1500 npm run simulate
```

El script (`scripts/simulate-events.ts`) envía la secuencia completa: logins,
llamadas entrantes, contestadas, `call.noanswer`, `call.hangup` con posgestión,
un `eventId` duplicado y un evento de una llamada inexistente (resiliencia).
Deja la última llamada en cola para demostrar el abandono por `maxWaitTimeSec`.

Se puede ejecutar varias veces seguidas: cada corrida genera `eventId` y
`callId` únicos (prefijo por ejecución), y la demo de idempotencia se hace
reenviando el mismo `eventId` dentro de la corrida. En corridas sucesivas los
`agent.login` de agentes ya en línea se reportan como `ignorado` (resiliencia).

### Pruebas unitarias

```bash
npm test          # Vitest: máquina de estados, servicio de agentes, asignación
```

---

## 2. Arquitectura

```
PBX/CRM ──POST /events──▶ EventsService ──▶ CallsService / AgentsService ──▶ PostgreSQL
                              │                        │
                              ▼                        ▼
                       AssignmentService (mutex)   DashboardService ──Socket.io──▶ React
                              ▲
                    MaintenanceService (cron: wrap-up 15s, abandono por maxWaitTimeSec)
```

| Módulo | Responsabilidad |
| --- | --- |
| `src/domain` | Máquina de estados del agente, estados de llamada, `InconsistencyError` |
| `src/events` | `POST /events`: idempotencia por `eventId` + resiliencia |
| `src/assignment` | Motor FIFO + Idle-Max protegido con `async-mutex` |
| `src/agents` | Único punto de mutación del estado del agente (valida la máquina) |
| `src/calls` | Ciclo de vida de llamadas (cola, respuesta, abandono, finalización) |
| `src/queues` | Métricas por cola: ASA, SLA (20s), espera máxima |
| `src/dashboard` | Gateway Socket.io: snapshot al conectar + broadcast en cada cambio |
| `src/cron` | Sweeper de WRAP_UP (1s) y abandono por espera máxima (5s) |
| `src/seed` | Agentes iniciales |
| `frontend/` | Tablero React: AgentCard, QueuePanel, WebPhone |

### API

| Método | Ruta | Descripción |
| --- | --- | --- |
| `POST` | `/events` | Ingesta de eventos del PBX (ver catálogo abajo) |
| `GET` | `/agents` | Lista de agentes con estado y `stateChangedAt` |
| `POST` | `/agents/pause` | `{ agentId, reason? }` — pausa manual del supervisor |
| `POST` | `/agents/unpause` | `{ agentId }` — despausa manual del supervisor |
| `GET` | `/calls` | Lista de llamadas |
| `GET` | `/queues` | Métricas por cola (incluye ASA y SLA) |
| `GET` | `/` | Health check |

### Catálogo de eventos (`POST /events`)

```jsonc
{
  "eventId": "e-001",            // idempotencia: repetido => descartado
  "type": "call.received",
  "timestamp": "2026-01-01T10:00:00.000Z",
  "payload": { "callId": "call-001", "queue": "ventas" }
}
```

| `type` | Payload | Efecto |
| --- | --- | --- |
| `call.received` | `callId, queue` | Crea la llamada `EN_COLA` y dispara asignación |
| `call.answered` | `callId, agentId?` | Llamada `ATENDIDA`, agente `EN_LLAMADA` |
| `call.noanswer` | `callId, agentId?` | Agente `TIMBRANDO -> PAUSA` ("No contesta"); la llamada vuelve **al inicio** de la cola |
| `call.hangup` | `callId` | Llamada `FINALIZADA` y agente `WRAP_UP` (15s); si estaba en cola/timbrando se marca `ABANDONADA` |
| `agent.login` / `agent.logout` | `agentId` | `OFFLINE <-> DISPONIBLE` |
| `agent.pause` / `agent.unpause` | `agentId, reason?` | `DISPONIBLE <-> PAUSA` |

Respuesta: `{ eventId, status: "processed" | "duplicate" | "ignored", reason? }`
siempre con HTTP 200, para que un evento inconsistente no sea un error HTTP.

---

## 3. Máquina de estados del agente

10 transiciones válidas y ninguna más (`src/domain/agent-state.ts`):

```
OFFLINE     <-> DISPONIBLE
DISPONIBLE  <-> PAUSA
PAUSA       ->  OFFLINE
DISPONIBLE  ->  TIMBRANDO
TIMBRANDO   <-> DISPONIBLE
TIMBRANDO   ->  EN_LLAMADA
EN_LLAMADA  ->  WRAP_UP
WRAP_UP     ->  DISPONIBLE
```

- Toda mutación pasa por `AgentsService.changeState`, que llama a
  `assertTransition`: es imposible persistir un estado fuera de la máquina.
- **Posgestión obligatoria:** en `call.hangup` el agente pasa a `WRAP_UP` con
  `wrapUpUntil = ahora + 15s`. Un sweeper cada 1s lo promueve a `DISPONIBLE`
  y re-dispara la asignación. Si el proceso se reinicia a mitad de la
  posgestión, el sweeper completa el ciclo al arrancar.

## 4. Motor de asignación y por qué el mutex

Algoritmo (`src/assignment/assignment.service.ts`):

1. **FIFO:** toma la llamada `EN_COLA` con el `enqueuedAt` más antiguo.
2. **Idle-Max:** entre los agentes `DISPONIBLE` que atienden esa cola,
   elige el de `idleSince` más antiguo (el que lleva más tiempo libre).
3. Repite hasta agotar llamadas o agentes compatibles.

**El problema de concurrencia:** el ciclo *leer → decidir → escribir* no es
atómico. Con dos `call.received` casi simultáneos (o un `call.received` y un
`agent.unpause` a la vez), ambos flujos pueden leer el mismo agente
`DISPONIBLE` y asignarle dos llamadas, o asignar la misma llamada a dos
agentes. En Node el event loop no salva esto: entre un `await` de base de
datos y el siguiente, otro request puede entrar a la sección crítica.

**La solución:** `async-mutex` (`Mutex.runExclusive`) serializa toda la
función de asignación. El mutex es por proceso, igual que el event loop, así
que cubre exactamente el modelo de despliegue de esta prueba (una instancia
de backend). Para múltiples instancias el patrón sería el mismo con un lock
distribuido (ej. `pg_advisory_lock` o `@nestjs/locks`); se documenta como
supuesto, no se implementa.

## 5. Idempotencia y resiliencia

- **Idempotencia:** cada `eventId` procesado se registra en
  `processed_events` (clave primaria). Un reenvío se detecta con el `SELECT`
  previo y, si hay carrera, el `INSERT` falla por clave duplicada y también
  se descarta. `e-002` duplicado ⇒ `status: "duplicate"`, sin efectos.
- **Resiliencia:** los handlers validan precondiciones (la llamada existe,
  está en el estado esperado, el agente está timbrando). Cualquier
  `InconsistencyError` se registra en log y el evento se responde como
  `ignored`: el servicio nunca se cae por un evento malformado o tardío.

## 6. Métricas de colas

`GET /queues` devuelve por cola: `waiting`, `ringing`, `answered`,
`abandoned`, `maxWaitTimeSec` (espera actual más larga), **ASA** (promedio de
`waitTimeSec` de las atendidas) y **SLA%** (atendidas con espera ≤ 20s,
configurable con `SLA_THRESHOLD_SEC`).

## 7. Frontend

- **Tablero en vivo:** Socket.io. El backend difunde el snapshot completo
  (`dashboard:state`) tras cada mutación y lo reenvía (`dashboard:snapshot`)
  a cada cliente al conectarse. Si la red cae, la UI muestra el indicador
  rojo y, al reconectar, reemplaza el estado con el snapshot fresco **sin
  recargar la página** (resincronización silenciosa).
- **AgentCard:** color por estado, nombre, extensión, colas y cronómetro
  `mm:ss` calculado desde `stateChangedAt`. Botones de supervisor
  **Pausar / Despausar** (`POST /agents/pause`, `POST /agents/unpause`).
- **QueuePanel:** llamadas en espera, atendidas, abandonadas, espera máxima,
  ASA y SLA.
- **WebPhone:** componente con `sip.js` (`SimpleUser`): registro a un
  servidor SIP (dominio, usuario, contraseña) y botones **Contestar** y
  **Colgar**. Requiere un PBX con transporte WSS para WebRTC; sin servidor
  muestra el error de conexión y queda listo para usar.

## 8. Supuestos

1. El `callId` y el `agentId` los provee el PBX en los eventos; el backend no
   los genera.
2. La asignación es automática al recibir `call.received` (ACD clásico); no
   hay paso manual de "aceptar" del agente.
3. `call.noanswer` regresa la llamada al inicio de la cola conservando su
   `enqueuedAt` original (al ser la más vieja, el FIFO la deja primera).
4. Un `call.hangup` sobre una llamada `TIMBRANDO` se interpreta como
   abandono del cliente; el agente vuelve a `DISPONIBLE`.
5. Mutex por proceso: válido para una instancia de backend. Multi-instancia
   requeriría lock distribuido (documentado arriba).
6. `synchronize: true` de TypeORM es deliberado para la prueba; en producción
   usarían migraciones.
7. Los eventos llegan por HTTP (el PBX no habla directamente con la DB) y el
   orden entre eventos distintos se resuelve con las validaciones de estado.

## 9. Declaración de IA

Esta solución fue desarrollada con asistencia de un agente de IA (Zed + GLM),
bajo la dirección y revisión del autor. La arquitectura, las decisiones de
diseño (máquina de estados estricta, mutex de asignación, snapshot completo
para resincronización) y la validación final son del autor; la IA se usó para
acelerar la redacción del código repetitivo y de esta documentación, en línea
con las políticas de uso de IA del proceso de selección.

## 10. Estructura del repositorio

```
├── docker-compose.yml        # db + backend + frontend
├── Dockerfile                # backend
├── src/
│   ├── domain/               # máquina de estados + errores (+ spec)
│   ├── agents/  calls/       # entidades, servicios, controladores (+ specs)
│   ├── assignment/           # motor FIFO + idle-max con async-mutex (+ spec)
│   ├── events/               # POST /events: idempotencia + resiliencia
│   ├── queues/               # métricas ASA / SLA
│   ├── dashboard/            # gateway Socket.io
│   ├── cron/                 # wrap-up sweeper + abandono por espera
│   └── seed/
├── scripts/simulate-events.ts
└── frontend/                 # dashboard React + WebPhone (Dockerfile propio)
```
