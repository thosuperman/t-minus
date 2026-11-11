// Deterministic scheduling engine. Pure functions only: same inputs, same outputs.
import {
  ConstraintStatus,
  DomainError,
  ExecState,
  PlanDef,
  Projection,
  RollbackLevel,
  RollbackWindow,
  StepDef,
  StepSchedule,
  StepState,
} from './types';

const MIN = 60_000;

export const ROLLBACK_WARNING_MIN = 60;
export const ROLLBACK_CRITICAL_MIN = 15;

export interface ValidationIssue {
  code: 'DUPLICATE_ID' | 'UNKNOWN_DEP' | 'SELF_DEP' | 'CYCLE' | 'BAD_DURATION' | 'MULTIPLE_PNR' | 'EMPTY';
  message: string;
  stepIds: string[];
}

/** Structural validation of a plan: ids, dependencies, durations, cycles. */
export function validatePlan(steps: StepDef[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (steps.length === 0) {
    issues.push({ code: 'EMPTY', message: 'The plan has no steps.', stepIds: [] });
    return issues;
  }
  const seen = new Set<string>();
  for (const s of steps) {
    if (seen.has(s.id)) issues.push({ code: 'DUPLICATE_ID', message: `Duplicate step id ${s.id}.`, stepIds: [s.id] });
    seen.add(s.id);
    if (!Number.isFinite(s.durationMin) || s.durationMin < 0)
      issues.push({ code: 'BAD_DURATION', message: `Step ${s.id} has an invalid duration.`, stepIds: [s.id] });
  }
  for (const s of steps) {
    for (const d of s.deps) {
      if (d === s.id) issues.push({ code: 'SELF_DEP', message: `Step ${s.id} depends on itself.`, stepIds: [s.id] });
      else if (!seen.has(d))
        issues.push({ code: 'UNKNOWN_DEP', message: `Step ${s.id} depends on unknown step ${d}.`, stepIds: [s.id] });
    }
  }
  const pnr = steps.filter((s) => s.kind === 'pnr');
  if (pnr.length > 1)
    issues.push({
      code: 'MULTIPLE_PNR',
      message: 'A plan can have only one point of no return.',
      stepIds: pnr.map((s) => s.id),
    });
  const cycle = findCycle(steps);
  if (cycle.length) issues.push({ code: 'CYCLE', message: `Dependency cycle: ${cycle.join(' → ')}.`, stepIds: cycle });
  return issues;
}

/** Kahn's algorithm. Returns ids in dependency order, or throws if the graph has a cycle. */
export function topoOrder(steps: StepDef[]): string[] {
  const ids = new Set(steps.map((s) => s.id));
  const indeg = new Map<string, number>();
  const out = new Map<string, string[]>();
  for (const s of steps) {
    indeg.set(s.id, 0);
    out.set(s.id, []);
  }
  for (const s of steps)
    for (const d of s.deps) {
      if (!ids.has(d) || d === s.id) continue;
      indeg.set(s.id, (indeg.get(s.id) ?? 0) + 1);
      out.get(d)!.push(s.id);
    }
  // Stable: keep the author's order among steps that are ready at the same time.
  const queue = steps.filter((s) => indeg.get(s.id) === 0).map((s) => s.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const n of out.get(id)!) {
      indeg.set(n, indeg.get(n)! - 1);
      if (indeg.get(n) === 0) queue.push(n);
    }
  }
  if (order.length !== steps.length) throw new DomainError('INVALID_PLAN', 'The dependency graph contains a cycle.');
  return order;
}

/** Returns one dependency cycle as a list of ids (first id repeated at the end), or [] if none. */
export function findCycle(steps: StepDef[]): string[] {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  let found: string[] = [];
  const visit = (id: string): boolean => {
    state.set(id, 1);
    stack.push(id);
    for (const d of byId.get(id)?.deps ?? []) {
      if (!byId.has(d)) continue;
      if (d === id) continue; // reported separately as SELF_DEP
      const st = state.get(d) ?? 0;
      if (st === 1) {
        found = [...stack.slice(stack.indexOf(d)), d].reverse();
        return true;
      }
      if (st === 0 && visit(d)) return true;
    }
    stack.pop();
    state.set(id, 2);
    return false;
  };
  for (const s of steps) if ((state.get(s.id) ?? 0) === 0 && visit(s.id)) break;
  return found;
}

/** All steps that directly or indirectly depend on `stepId`, in dependency order. */
export function downstreamOf(steps: StepDef[], stepId: string): string[] {
  const order = topoOrder(steps);
  const byId = new Map(steps.map((s) => [s.id, s]));
  const hit = new Set<string>([stepId]);
  const res: string[] = [];
  for (const id of order) {
    if (id === stepId) continue;
    if (byId.get(id)!.deps.some((d) => hit.has(d))) {
      hit.add(id);
      res.push(id);
    }
  }
  return res;
}

interface Pass {
  start: Record<string, number>;
  end: Record<string, number>;
  finish: number;
}

/** Baseline: classic forward pass from the planned start using planned durations only. */
function baselinePass(plan: PlanDef, order: string[], byId: Map<string, StepDef>): Pass {
  const start: Record<string, number> = {};
  const end: Record<string, number> = {};
  let finish = plan.plannedStart;
  for (const id of order) {
    const s = byId.get(id)!;
    let es = plan.plannedStart;
    for (const d of s.deps) es = Math.max(es, end[d]);
    start[id] = es;
    end[id] = es + s.durationMin * MIN;
    finish = Math.max(finish, end[id]);
  }
  return { start, end, finish };
}

const emptyStep: StepState = { status: 'pending' };

/**
 * Compute the full projection of a plan at plan-time `now`.
 *
 * Rules, in order of trust:
 *  - recorded facts (actual start / end) are never changed;
 *  - a running step ends at actualStart + planned duration, unless
 *      a user assumption says otherwise, or it is already overrunning,
 *      in which case the earliest possible end is `now` (a floor, not a forecast);
 *  - a blocked step cannot end before `now` plus its remaining planned work;
 *  - a pending step starts when its dependencies end, but never before `now`.
 */
export function computeProjection(plan: PlanDef, exec: ExecState, now: number): Projection {
  const order = topoOrder(plan.steps);
  const byId = new Map(plan.steps.map((s) => [s.id, s]));
  const base = baselinePass(plan, order, byId);
  const st = (id: string): StepState => exec.steps[id] ?? emptyStep;

  const start: Record<string, number> = {};
  const end: Record<string, number> = {};
  const basis: Record<string, StepSchedule['basis']> = {};
  const overrun: Record<string, number> = {};
  const assumptions: string[] = [];
  // Before the plan is live, nothing can start earlier than the planned start or now, whichever is later.
  const floor = exec.phase === 'ready' ? Math.max(now, plan.plannedStart) : now;

  for (const id of order) {
    const s = byId.get(id)!;
    const x = st(id);
    const dur = s.durationMin * MIN;
    overrun[id] = 0;
    if (x.status === 'done' && x.actualStart !== undefined && x.actualEnd !== undefined) {
      start[id] = x.actualStart;
      end[id] = x.actualEnd;
      basis[id] = 'actual';
      continue;
    }
    if ((x.status === 'running' || x.status === 'blocked') && x.actualStart !== undefined) {
      start[id] = x.actualStart;
      const plannedEnd = x.actualStart + dur;
      overrun[id] = Math.max(0, Math.round((now - plannedEnd) / MIN));
      if (x.assumedRemainingMin !== undefined && x.assumptionAt !== undefined) {
        // The assumption was made at assumptionAt; it cannot place the end in the past.
        end[id] = Math.max(now, x.assumptionAt + x.assumedRemainingMin * MIN);
        basis[id] = 'assumption';
        assumptions.push(
          `${id}: ${x.assumedRemainingMin} min remaining, as entered by an operator. This is an assumption, not a measurement.`,
        );
      } else if (x.status === 'blocked') {
        const worked = Math.max(0, (x.blockedAt ?? now) - x.actualStart);
        end[id] = now + Math.max(0, dur - worked);
        basis[id] = 'blocked-floor';
        assumptions.push(`${id}: blocked. The projection assumes it is unblocked now; every further minute blocked adds a minute.`);
      } else if (now > plannedEnd) {
        end[id] = now;
        basis[id] = 'overrun-floor';
        assumptions.push(
          `${id}: running ${overrun[id]} min over plan. The projection assumes it finishes now; this is the earliest possible finish, not a forecast.`,
        );
      } else {
        end[id] = plannedEnd;
        basis[id] = 'planned-duration';
      }
      continue;
    }
    // Pending (or blocked before it ever started).
    let es = floor;
    for (const d of s.deps) es = Math.max(es, end[d]);
    start[id] = es;
    end[id] = es + dur;
    basis[id] = x.status === 'blocked' ? 'blocked-floor' : 'planned-duration';
    if (x.status === 'blocked')
      assumptions.push(`${id}: blocked before start. The projection assumes it can start as soon as its dependencies finish.`);
  }

  let projectedFinish = plan.plannedStart;
  for (const id of order) projectedFinish = Math.max(projectedFinish, end[id]);

  // Backward pass on the projected network gives the current float and critical path.
  const succ = new Map<string, string[]>();
  for (const s of plan.steps) succ.set(s.id, []);
  for (const s of plan.steps) for (const d of s.deps) succ.get(d)!.push(s.id);
  const lateEnd: Record<string, number> = {};
  for (const id of [...order].reverse()) {
    let lf = projectedFinish;
    for (const n of succ.get(id)!) lf = Math.min(lf, lateEnd[n] - (end[n] - start[n]));
    lateEnd[id] = lf;
  }
  const baseLateEnd: Record<string, number> = {};
  for (const id of [...order].reverse()) {
    let lf = base.finish;
    for (const n of succ.get(id)!) lf = Math.min(lf, baseLateEnd[n] - byId.get(n)!.durationMin * MIN);
    baseLateEnd[id] = lf;
  }

  const steps: Record<string, StepSchedule> = {};
  const counts = { total: order.length, done: 0, running: 0, blocked: 0, pending: 0, overrunning: 0 };
  const awaitingDecision: string[] = [];
  for (const id of order) {
    const s = byId.get(id)!;
    const x = st(id);
    counts[x.status]++;
    if (overrun[id] > 0 && x.status !== 'done') counts.overrunning++;
    const floatMin = Math.round((lateEnd[id] - end[id]) / MIN);
    const depsDone = s.deps.every((d) => st(d).status === 'done');
    const ready = exec.phase === 'live' && x.status === 'pending' && depsDone;
    if (ready && (s.kind === 'gate' || s.kind === 'pnr')) awaitingDecision.push(id);
    steps[id] = {
      id,
      baselineStart: base.start[id],
      baselineEnd: base.end[id],
      start: start[id],
      end: end[id],
      startIsActual: x.actualStart !== undefined,
      endIsActual: x.status === 'done',
      slipMin: Math.round((end[id] - base.end[id]) / MIN),
      floatMin,
      critical: floatMin <= 0,
      baselineCritical: Math.round((baseLateEnd[id] - base.end[id]) / MIN) <= 0,
      overrunMin: x.status === 'done' ? 0 : overrun[id],
      basis: basis[id],
      ready,
    };
  }

  const criticalPath = order.filter((id) => steps[id].critical);

  const constraints: ConstraintStatus[] = [];
  const windowEnd = plan.plannedStart + plan.windowEndMin * MIN;
  constraints.push({
    id: 'window',
    label: plan.windowLabel,
    deadline: windowEnd,
    projected: projectedFinish,
    marginMin: Math.round((windowEnd - projectedFinish) / MIN),
    breached: projectedFinish > windowEnd,
  });
  for (const s of plan.steps) {
    if (s.mustFinishByMin === undefined) continue;
    const deadline = plan.plannedStart + s.mustFinishByMin * MIN;
    constraints.push({
      id: s.id,
      label: s.constraintLabel ?? `${s.id} must finish`,
      deadline,
      projected: end[s.id],
      marginMin: Math.round((deadline - end[s.id]) / MIN),
      breached: end[s.id] > deadline,
    });
  }

  const rollback = computeRollback(plan, exec, now, start, windowEnd);

  return {
    now,
    baselineFinish: base.finish,
    projectedFinish,
    slipMin: Math.round((projectedFinish - base.finish) / MIN),
    steps,
    order,
    criticalPath,
    constraints,
    rollback,
    counts,
    awaitingDecision,
    assumptions,
  };
}

/**
 * Rollback decision window.
 * A rollback must (a) start before the point of no return begins and
 * (b) start early enough to finish inside the cutover window.
 * The decision deadline is the earlier of the two.
 */
function computeRollback(
  plan: PlanDef,
  exec: ExecState,
  now: number,
  start: Record<string, number>,
  windowEnd: number,
): RollbackWindow {
  const latestRollbackStart = windowEnd - plan.rollbackDurationMin * MIN;
  const pnr = plan.steps.find((s) => s.kind === 'pnr');
  const pnrState = pnr ? exec.steps[pnr.id] : undefined;
  const pnrPassed = !!pnrState && pnrState.status !== 'pending' && pnrState.actualStart !== undefined;
  const pnrStart = pnr ? start[pnr.id] : undefined;
  // Once every dependency of the point of no return is done, it starts only when a commander confirms it.
  // Until then the plan does not force the decision; the time needed to roll back is the only limit.
  const pnrAwaitingConfirmation =
    !!pnr && !pnrPassed && exec.phase === 'live' && pnr.deps.every((d) => exec.steps[d]?.status === 'done');
  const decisionDeadline =
    pnrStart !== undefined && !pnrAwaitingConfirmation ? Math.min(latestRollbackStart, pnrStart) : latestRollbackStart;
  const remainingMin = Math.round((decisionDeadline - now) / MIN);
  let level: RollbackLevel;
  let closedReason: RollbackWindow['closedReason'];
  if (pnrPassed) {
    level = 'closed';
    closedReason = 'pnr-passed';
  } else if (now >= latestRollbackStart) {
    level = 'closed';
    closedReason = 'time-elapsed';
  } else if (remainingMin <= ROLLBACK_CRITICAL_MIN) level = 'critical';
  else if (remainingMin <= ROLLBACK_WARNING_MIN) level = 'warning';
  else level = 'open';
  return {
    available: true,
    level,
    latestRollbackStart,
    pnrStart,
    pnrStepId: pnr?.id,
    decisionDeadline,
    remainingMin: level === 'closed' ? 0 : Math.max(0, remainingMin),
    closedReason,
    pnrAwaitingConfirmation,
  };
}

/** Downstream impact of one step: every dependent step with its projected delay against baseline. */
export function impactOf(plan: PlanDef, proj: Projection, stepId: string) {
  const ids = downstreamOf(plan.steps, stepId);
  return ids.map((id) => ({
    id,
    slipMin: proj.steps[id].slipMin,
    critical: proj.steps[id].critical,
    projectedStart: proj.steps[id].start,
    projectedEnd: proj.steps[id].end,
  }));
}
