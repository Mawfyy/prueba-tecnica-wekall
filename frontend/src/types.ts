export type AgentState =
  | 'OFFLINE'
  | 'DISPONIBLE'
  | 'PAUSA'
  | 'TIMBRANDO'
  | 'EN_LLAMADA'
  | 'WRAP_UP';

export type CallState =
  | 'EN_COLA'
  | 'TIMBRANDO'
  | 'ATENDIDA'
  | 'FINALIZADA'
  | 'ABANDONADA';

export interface Agent {
  id: string;
  name: string;
  extension: string;
  queues: string[];
  state: AgentState;
  stateChangedAt: string;
  idleSince: string | null;
  pauseReason: string | null;
  wrapUpUntil: string | null;
}

export interface Call {
  id: string;
  queue: string;
  state: CallState;
  enqueuedAt: string;
  assignedAt: string | null;
  answeredAt: string | null;
  endedAt: string | null;
  agentId: string | null;
  waitTimeSec: number | null;
  talkTimeSec: number | null;
}

export interface QueueMetrics {
  queue: string;
  waiting: number;
  ringing: number;
  answered: number;
  abandoned: number;
  maxWaitTimeSec: number;
  asaSec: number | null;
  slaPct: number | null;
}

export interface DashboardSnapshot {
  serverTime: string;
  agents: Agent[];
  queues: QueueMetrics[];
  calls: Call[];
}
