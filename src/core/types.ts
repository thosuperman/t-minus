// Shared domain types. Pure data: no Forge imports, usable from backend, UI and tests.

export type StepKind = 'task' | 'gate' | 'pnr'; // pnr = point of no return (rollback boundary)

export interface StepDef {
  id: string; // stable id inside the plan (Jira issue key when synced from Jira)
  title: string;
  kind: StepKind;
  durationMin: number; // planned duration
  deps: string[]; // ids that must be finished first
  workstream: string;
  ownerId?: string; // Atlassian accountId. Names are never stored; they are looked up when a view is built.
  issueKey?: string; // Jira issue backing this step
  /** Optional constraint: step must be finished by this offset (minutes from planned start). */
  mustFinishByMin?: number;
  constraintLabel?: string;
}

export interface PlanDef {
  id: string;
  name: string;
  projectKey?: string;
  /** Planned start, epoch ms, in plan time. */
  plannedStart: number;
  /** Hard end of the cutover window, minutes from planned start. */
  windowEndMin: number;
  windowLabel: string;
  /** How long a rollback takes; it must complete before the window ends. */
  rollbackDurationMin: number;
  /** accountIds allowed to command the plan and record gate decisions. */
  commanders: string[];
  approvers: string[];
  /** True for demo plans: the plan clock may be advanced artificially. */
  simulation: boolean;
  createdBy: string;
  createdAt: number; // real server time
  steps: StepDef[];
}

export type StepStatus = 'pending' | 'running' | 'blocked' | 'done';
export type GateDecision = 'GO' | 'CONDITIONAL_GO' | 'NO_GO';
export type PlanPhase = 'ready' | 'live' | 'halted' | 'complete';

export interface StepState {
  status: StepStatus;
  actualStart?: number; // plan time, epoch ms
  actualEnd?: number;
  startedBy?: string;
  completedBy?: string;
  blockedReason?: string;
  blockedAt?: number;
  /** User-entered assumption: minutes still needed, as stated at assumptionAt. */
  assumedRemainingMin?: number;
  assumptionAt?: number;
  assumptionBy?: string;
  decision?: GateDecision;
  decisionNote?: string;
  decisionBy?: string;
  decisionAt?: number;
  escalated?: boolean;
}

export interface ExecState {
  phase: PlanPhase;
  /** Offset added to real time to get plan time. Non-zero only for simulation plans. */
  clockOffsetMs: number;
  actualStart?: number; // plan time when the plan went live
  steps: Record<string, StepState>;
  haltedReason?: string;
}

/** Only the account id is stored. Display names are personal data and are resolved from Jira at read time. */
export interface Actor {
  accountId: string;
}

/** Every state change is one immutable event. `at` is real server time and is never simulated. */
export interface ExecEvent {
  seq: number;
  type:
    | 'PLAN_STARTED'
    | 'STEP_STARTED'
    | 'STEP_COMPLETED'
    | 'STEP_BLOCKED'
    | 'STEP_UNBLOCKED'
    | 'NOTE_ADDED'
    | 'ESCALATED'
    | 'ASSUMPTION_SET'
    | 'GATE_DECIDED'
    | 'PNR_CONFIRMED'
    | 'CLOCK_ADVANCED';
  at: number; // real server time, epoch ms
  planTime: number; // plan time at the moment of the event
  simulated: boolean; // true when plan time differs from real time
  actor: Actor;
  source: 'ui' | 'rovo' | 'webtrigger';
  stepId?: string;
  text?: string;
  decision?: GateDecision;
  minutes?: number;
}

export type Command =
  | { type: 'startPlan' }
  | { type: 'startStep'; stepId: string }
  | { type: 'completeStep'; stepId: string }
  | { type: 'blockStep'; stepId: string; reason: string }
  | { type: 'unblockStep'; stepId: string }
  | { type: 'addNote'; stepId?: string; text: string }
  | { type: 'escalate'; stepId: string; text: string }
  | { type: 'setAssumption'; stepId: string; remainingMin: number }
  | { type: 'decideGate'; stepId: string; decision: GateDecision; note: string }
  | { type: 'confirmPnr'; stepId: string; note: string }
  | { type: 'advanceClock'; minutes: number };

export class DomainError extends Error {
  constructor(
    public code:
      | 'NOT_FOUND'
      | 'FORBIDDEN'
      | 'INVALID_STATE'
      | 'INVALID_INPUT'
      | 'CONFLICT'
      | 'INVALID_PLAN',
    message: string,
  ) {
    super(message);
  }
}

// ---------- Engine output ----------

export interface StepSchedule {
  id: string;
  baselineStart: number;
  baselineEnd: number;
  /** Actual when recorded, otherwise projected. */
  start: number;
  end: number;
  startIsActual: boolean;
  endIsActual: boolean;
  /** Minutes the projected/actual end is later than baseline (negative = early). */
  slipMin: number;
  /** Slack on the current projected network, minutes. 0 = on the critical path. */
  floatMin: number;
  critical: boolean;
  baselineCritical: boolean;
  /** Running longer than planned, minutes (0 if not). */
  overrunMin: number;
  /** Why the projected end is what it is. */
  basis: 'actual' | 'planned-duration' | 'assumption' | 'overrun-floor' | 'blocked-floor';
  ready: boolean; // all dependencies done, can be started now
}

export interface ConstraintStatus {
  id: string; // 'window' or step id
  label: string;
  deadline: number;
  projected: number;
  marginMin: number; // negative = projected breach
  breached: boolean;
}

export type RollbackLevel = 'open' | 'warning' | 'critical' | 'closed';

export interface RollbackWindow {
  available: boolean; // false when the plan has no rollback boundary
  level: RollbackLevel;
  /** Latest moment a rollback can start and still finish inside the window. */
  latestRollbackStart: number;
  /** Projected start of the point of no return, if any. */
  pnrStart?: number;
  pnrStepId?: string;
  /** The decision deadline: the earlier of the two above. */
  decisionDeadline: number;
  remainingMin: number;
  closedReason?: 'pnr-passed' | 'time-elapsed';
  /** True when the point of no return is ready and only waits for a commander to confirm it. */
  pnrAwaitingConfirmation: boolean;
}

export interface Projection {
  now: number;
  baselineFinish: number;
  projectedFinish: number;
  slipMin: number;
  steps: Record<string, StepSchedule>;
  order: string[]; // topological order
  criticalPath: string[];
  constraints: ConstraintStatus[];
  rollback: RollbackWindow;
  counts: { total: number; done: number; running: number; blocked: number; pending: number; overrunning: number };
  awaitingDecision: string[]; // gate / pnr ids whose dependencies are done and need a human decision
  /** Plain statements of what the projection assumes. */
  assumptions: string[];
}
