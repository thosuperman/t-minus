// Event-sourced execution state: validate a command against current state, produce an event, fold events.
import { Actor, Command, DomainError, ExecEvent, ExecState, PlanDef, StepDef, StepState } from './types';

export function initialState(plan: PlanDef): ExecState {
  const steps: Record<string, StepState> = {};
  for (const s of plan.steps) steps[s.id] = { status: 'pending' };
  return { phase: 'ready', clockOffsetMs: 0, steps };
}

export interface Roles {
  commander: boolean;
  approver: boolean;
  /** May start/complete/block steps: commanders, step owners and anyone with edit permission on the project. */
  operator: boolean;
}

export function rolesFor(plan: PlanDef, accountId: string, canEditProject: boolean): Roles {
  const commander = plan.commanders.includes(accountId);
  return {
    commander,
    approver: commander || plan.approvers.includes(accountId),
    operator: commander || canEditProject || plan.steps.some((s) => s.ownerId === accountId),
  };
}

function step(plan: PlanDef, id: string): StepDef {
  const s = plan.steps.find((x) => x.id === id);
  if (!s) throw new DomainError('NOT_FOUND', `Step ${id} does not exist in this plan.`);
  return s;
}

const need = (ok: boolean, code: DomainError['code'], msg: string) => {
  if (!ok) throw new DomainError(code, msg);
};

/**
 * Validate `cmd` against the current state and return the event to append.
 * Throws DomainError when the command is not allowed. Never mutates state.
 */
export function decide(
  plan: PlanDef,
  state: ExecState,
  cmd: Command,
  actor: Actor,
  roles: Roles,
  realNow: number,
  source: ExecEvent['source'],
  nextSeq: number,
): ExecEvent {
  const planTime = realNow + state.clockOffsetMs;
  const base = { seq: nextSeq, at: realNow, planTime, simulated: state.clockOffsetMs !== 0, actor: { accountId: actor.accountId }, source };
  const live = () => need(state.phase === 'live', 'INVALID_STATE', `The plan is ${state.phase}; this action needs a live plan.`);

  switch (cmd.type) {
    case 'startPlan': {
      need(roles.commander, 'FORBIDDEN', 'Only a cutover commander can start the plan.');
      need(state.phase === 'ready', 'INVALID_STATE', `The plan is already ${state.phase}.`);
      return { ...base, type: 'PLAN_STARTED' };
    }
    case 'startStep': {
      live();
      const s = step(plan, cmd.stepId);
      const x = state.steps[s.id];
      need(roles.operator, 'FORBIDDEN', 'You are not allowed to operate steps in this plan.');
      need(s.kind === 'task', 'INVALID_STATE', `${s.id} is a decision checkpoint; record a decision instead of starting it.`);
      need(x.status === 'pending', 'INVALID_STATE', `${s.id} is already ${x.status}.`);
      const open = s.deps.filter((d) => state.steps[d].status !== 'done');
      need(open.length === 0, 'INVALID_STATE', `${s.id} cannot start: waiting for ${open.join(', ')}.`);
      return { ...base, type: 'STEP_STARTED', stepId: s.id };
    }
    case 'completeStep': {
      live();
      const s = step(plan, cmd.stepId);
      const x = state.steps[s.id];
      need(roles.operator, 'FORBIDDEN', 'You are not allowed to operate steps in this plan.');
      need(x.status === 'running', 'INVALID_STATE', `${s.id} is ${x.status}; only a running step can be completed.`);
      return { ...base, type: 'STEP_COMPLETED', stepId: s.id };
    }
    case 'blockStep': {
      live();
      const s = step(plan, cmd.stepId);
      const x = state.steps[s.id];
      need(roles.operator, 'FORBIDDEN', 'You are not allowed to operate steps in this plan.');
      need(x.status === 'running' || x.status === 'pending', 'INVALID_STATE', `${s.id} is ${x.status} and cannot be blocked.`);
      need(cmd.reason.trim().length > 0, 'INVALID_INPUT', 'A blocker needs a reason.');
      return { ...base, type: 'STEP_BLOCKED', stepId: s.id, text: cmd.reason.trim().slice(0, 500) };
    }
    case 'unblockStep': {
      live();
      const s = step(plan, cmd.stepId);
      need(roles.operator, 'FORBIDDEN', 'You are not allowed to operate steps in this plan.');
      need(state.steps[s.id].status === 'blocked', 'INVALID_STATE', `${s.id} is not blocked.`);
      return { ...base, type: 'STEP_UNBLOCKED', stepId: s.id };
    }
    case 'addNote': {
      need(roles.operator, 'FORBIDDEN', 'You are not allowed to add notes to this plan.');
      if (cmd.stepId) step(plan, cmd.stepId);
      need(cmd.text.trim().length > 0, 'INVALID_INPUT', 'The note is empty.');
      return { ...base, type: 'NOTE_ADDED', stepId: cmd.stepId, text: cmd.text.trim().slice(0, 1000) };
    }
    case 'escalate': {
      live();
      const s = step(plan, cmd.stepId);
      need(roles.operator, 'FORBIDDEN', 'You are not allowed to escalate in this plan.');
      need(cmd.text.trim().length > 0, 'INVALID_INPUT', 'An escalation needs a description.');
      return { ...base, type: 'ESCALATED', stepId: s.id, text: cmd.text.trim().slice(0, 1000) };
    }
    case 'setAssumption': {
      live();
      const s = step(plan, cmd.stepId);
      const x = state.steps[s.id];
      need(roles.operator, 'FORBIDDEN', 'You are not allowed to operate steps in this plan.');
      need(x.status === 'running' || x.status === 'blocked', 'INVALID_STATE', `${s.id} is ${x.status}; an estimate applies to a step in progress.`);
      need(Number.isFinite(cmd.remainingMin) && cmd.remainingMin >= 0 && cmd.remainingMin <= 24 * 60, 'INVALID_INPUT', 'Remaining minutes must be between 0 and 1440.');
      return { ...base, type: 'ASSUMPTION_SET', stepId: s.id, minutes: Math.round(cmd.remainingMin) };
    }
    case 'decideGate': {
      live();
      const s = step(plan, cmd.stepId);
      const x = state.steps[s.id];
      need(s.kind === 'gate', 'INVALID_STATE', `${s.id} is not a go/no-go checkpoint.`);
      need(roles.approver, 'FORBIDDEN', 'Only an authorized approver can record a go/no-go decision.');
      need(x.status === 'pending', 'INVALID_STATE', `A decision for ${s.id} is already recorded.`);
      const open = s.deps.filter((d) => state.steps[d].status !== 'done');
      need(open.length === 0, 'INVALID_STATE', `${s.id} cannot be decided yet: waiting for ${open.join(', ')}.`);
      need(['GO', 'CONDITIONAL_GO', 'NO_GO'].includes(cmd.decision), 'INVALID_INPUT', 'Unknown decision.');
      need(cmd.decision === 'GO' || cmd.note.trim().length > 0, 'INVALID_INPUT', 'A conditional go or a no-go needs a note with the evidence or conditions.');
      return { ...base, type: 'GATE_DECIDED', stepId: s.id, decision: cmd.decision, text: cmd.note.trim().slice(0, 1000) };
    }
    case 'confirmPnr': {
      live();
      const s = step(plan, cmd.stepId);
      const x = state.steps[s.id];
      need(s.kind === 'pnr', 'INVALID_STATE', `${s.id} is not the point of no return.`);
      need(roles.commander, 'FORBIDDEN', 'Only a cutover commander can pass the point of no return.');
      need(x.status === 'pending', 'INVALID_STATE', `${s.id} is already ${x.status}.`);
      const open = s.deps.filter((d) => state.steps[d].status !== 'done');
      need(open.length === 0, 'INVALID_STATE', `${s.id} cannot start: waiting for ${open.join(', ')}.`);
      need(cmd.note.trim().length > 0, 'INVALID_INPUT', 'Passing the point of no return needs an explicit confirmation note.');
      return { ...base, type: 'PNR_CONFIRMED', stepId: s.id, text: cmd.note.trim().slice(0, 1000) };
    }
    case 'advanceClock': {
      need(plan.simulation, 'FORBIDDEN', 'The clock can only be advanced on a simulation plan.');
      need(roles.commander, 'FORBIDDEN', 'Only a cutover commander can advance the simulated clock.');
      need(Number.isFinite(cmd.minutes) && cmd.minutes > 0 && cmd.minutes <= 240, 'INVALID_INPUT', 'Advance by 1 to 240 minutes.');
      return { ...base, type: 'CLOCK_ADVANCED', minutes: Math.round(cmd.minutes) };
    }
  }
}

/** Apply one event. Pure: returns a new state. */
export function apply(plan: PlanDef, state: ExecState, e: ExecEvent): ExecState {
  const next: ExecState = { ...state, steps: { ...state.steps } };
  const upd = (id: string, patch: Partial<StepState>) => (next.steps[id] = { ...next.steps[id], ...patch });
  const who = e.actor.accountId; // account id only; names are resolved when shown
  switch (e.type) {
    case 'PLAN_STARTED':
      next.phase = 'live';
      next.actualStart = e.planTime;
      break;
    case 'STEP_STARTED':
      upd(e.stepId!, { status: 'running', actualStart: e.planTime, startedBy: who });
      break;
    case 'PNR_CONFIRMED':
      upd(e.stepId!, { status: 'running', actualStart: e.planTime, startedBy: who, decisionNote: e.text, decisionBy: who, decisionAt: e.planTime });
      break;
    case 'STEP_COMPLETED':
      upd(e.stepId!, { status: 'done', actualEnd: e.planTime, completedBy: who, blockedReason: undefined, blockedAt: undefined });
      break;
    case 'STEP_BLOCKED':
      upd(e.stepId!, { status: 'blocked', blockedReason: e.text, blockedAt: e.planTime });
      break;
    case 'STEP_UNBLOCKED': {
      const x = next.steps[e.stepId!];
      // Time lost while blocked after the step started still has to be worked, so it is carried as a pause.
      const paused = x.actualStart !== undefined && x.blockedAt !== undefined ? Math.max(0, e.planTime - x.blockedAt) : 0;
      upd(e.stepId!, {
        status: x.actualStart !== undefined ? 'running' : 'pending',
        blockedReason: undefined,
        blockedAt: undefined,
        pausedMs: (x.pausedMs ?? 0) + paused,
      });
      break;
    }
    case 'ESCALATED':
      upd(e.stepId!, { escalated: true });
      break;
    case 'ASSUMPTION_SET':
      upd(e.stepId!, { assumedRemainingMin: e.minutes, assumptionAt: e.planTime, assumptionBy: who });
      break;
    case 'GATE_DECIDED':
      if (e.decision === 'NO_GO') {
        upd(e.stepId!, { decision: e.decision, decisionNote: e.text, decisionBy: who, decisionAt: e.planTime });
        next.phase = 'halted';
        next.haltedReason = `No-go recorded at ${e.stepId}.`;
      } else {
        // A gate is instantaneous: the decision is both its start and its end.
        upd(e.stepId!, { status: 'done', actualStart: e.planTime, actualEnd: e.planTime, decision: e.decision, decisionNote: e.text, decisionBy: who, decisionAt: e.planTime, completedBy: who });
      }
      break;
    case 'CLOCK_ADVANCED':
      next.clockOffsetMs = state.clockOffsetMs + (e.minutes ?? 0) * 60_000;
      break;
    case 'NOTE_ADDED':
      break;
  }
  if (next.phase === 'live' && plan.steps.every((s) => next.steps[s.id].status === 'done')) next.phase = 'complete';
  return next;
}

export function fold(plan: PlanDef, events: ExecEvent[], from: ExecState = initialState(plan)): ExecState {
  return events.reduce((s, e) => apply(plan, s, e), from);
}
