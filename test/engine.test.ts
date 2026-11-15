import { describe, expect, it } from 'vitest';
import { computeProjection, downstreamOf, findCycle, impactOf, topoOrder, validatePlan } from '../src/core/engine';
import { buildDemoPlan } from '../src/core/demo';
import { initialState } from '../src/core/events';
import { ExecState, PlanDef, StepDef } from '../src/core/types';

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 14, 22, 0, 0);
const s = (id: string, durationMin: number, deps: string[] = [], extra: Partial<StepDef> = {}): StepDef => ({ id, title: id, kind: 'task', durationMin, deps, workstream: 'w', ...extra });
const plan = (steps: StepDef[], extra: Partial<PlanDef> = {}): PlanDef => ({
  id: 'p', name: 'p', plannedStart: T0, windowEndMin: 300, windowLabel: 'window', rollbackDurationMin: 60,
  commanders: ['c'], approvers: ['c'], simulation: true, createdBy: 'c', createdAt: T0, steps, ...extra,
});
const live = (p: PlanDef, patch: ExecState['steps'] = {}): ExecState => {
  const st = initialState(p);
  return { ...st, phase: 'live', actualStart: T0, steps: { ...st.steps, ...patch } };
};
// Diamond: A -> (B long, C short) -> D
const diamond = () => plan([s('A', 10), s('B', 60, ['A']), s('C', 20, ['A']), s('D', 30, ['B', 'C'])]);

describe('plan validation', () => {
  it('accepts the demo plan', () => {
    expect(validatePlan(buildDemoPlan('x', T0, 'c').steps)).toEqual([]);
  });
  it('detects a dependency cycle and names its members', () => {
    const steps = [s('A', 5, ['C']), s('B', 5, ['A']), s('C', 5, ['B']), s('D', 5)];
    const issues = validatePlan(steps);
    const cycle = issues.find((i) => i.code === 'CYCLE');
    expect(cycle).toBeTruthy();
    expect(new Set(cycle!.stepIds)).toEqual(new Set(['A', 'B', 'C']));
    expect(findCycle(steps).length).toBe(4);
    expect(() => topoOrder(steps)).toThrow(/cycle/);
  });
  it('detects self dependency, unknown dependency, duplicate id, bad duration, two points of no return, empty plan', () => {
    const codes = (steps: StepDef[]) => validatePlan(steps).map((i) => i.code);
    expect(codes([s('A', 5, ['A'])])).toContain('SELF_DEP');
    expect(codes([s('A', 5, ['Z'])])).toContain('UNKNOWN_DEP');
    expect(codes([s('A', 5), s('A', 5)])).toContain('DUPLICATE_ID');
    expect(codes([s('A', -1)])).toContain('BAD_DURATION');
    expect(codes([s('A', 5, [], { kind: 'pnr' }), s('B', 5, [], { kind: 'pnr' })])).toContain('MULTIPLE_PNR');
    expect(codes([])).toEqual(['EMPTY']);
  });
  it('orders steps so every dependency comes first', () => {
    const p = buildDemoPlan('x', T0, 'c');
    const order = topoOrder(p.steps);
    for (const st of p.steps) for (const d of st.deps) expect(order.indexOf(d)).toBeLessThan(order.indexOf(st.id));
  });
});

describe('baseline and critical path', () => {
  it('computes the baseline finish and critical path of a diamond', () => {
    const p = diamond();
    const proj = computeProjection(p, initialState(p), T0);
    expect(proj.baselineFinish).toBe(T0 + 100 * MIN);
    expect(proj.projectedFinish).toBe(T0 + 100 * MIN);
    expect(proj.criticalPath).toEqual(['A', 'B', 'D']);
    expect(proj.steps.C.floatMin).toBe(40);
    expect(proj.steps.C.critical).toBe(false);
  });
  it('runs parallel branches at the same time', () => {
    const p = diamond();
    const proj = computeProjection(p, initialState(p), T0);
    expect(proj.steps.B.start).toBe(proj.steps.C.start);
  });
  it('matches the hand-calculated demo baseline (355 min, critical through MIG-2 and MIG-3)', () => {
    const p = buildDemoPlan('x', T0, 'c');
    const proj = computeProjection(p, initialState(p), T0);
    expect((proj.baselineFinish - T0) / MIN).toBe(355);
    expect(proj.criticalPath).toEqual(['FRZ-1', 'BKP-1', 'MIG-2', 'MIG-3', 'REC-1', 'GATE-1', 'PNR-1', 'PAY-1', 'PAY-2', 'GATE-2', 'COM-1']);
    expect(proj.steps['MIG-1'].floatMin).toBe(35);
  });
});

describe('slip propagation', () => {
  it('a delayed critical step moves the projected finish by the same amount', () => {
    const p = diamond();
    // A done on time, B started on time but still running at T+90 (planned end T+70): 20 min over.
    const st = live(p, {
      A: { status: 'done', actualStart: T0, actualEnd: T0 + 10 * MIN },
      B: { status: 'running', actualStart: T0 + 10 * MIN },
      C: { status: 'done', actualStart: T0 + 10 * MIN, actualEnd: T0 + 30 * MIN },
    });
    const proj = computeProjection(p, st, T0 + 90 * MIN);
    expect(proj.steps.B.overrunMin).toBe(20);
    expect(proj.steps.B.basis).toBe('overrun-floor');
    expect(proj.slipMin).toBe(20);
    expect(proj.steps.D.slipMin).toBe(20);
    expect(proj.assumptions.join(' ')).toMatch(/earliest possible finish/);
  });
  it('a delay on a non-critical step is absorbed by its float', () => {
    const p = diamond();
    // C (float 40) takes 30 min longer than planned; B on time.
    const st = live(p, {
      A: { status: 'done', actualStart: T0, actualEnd: T0 + 10 * MIN },
      B: { status: 'running', actualStart: T0 + 10 * MIN },
      C: { status: 'done', actualStart: T0 + 10 * MIN, actualEnd: T0 + 60 * MIN },
    });
    const proj = computeProjection(p, st, T0 + 60 * MIN);
    expect(proj.steps.C.slipMin).toBe(30);
    expect(proj.slipMin).toBe(0);
    expect(proj.steps.D.slipMin).toBe(0);
  });
  it('a non-critical delay larger than its float becomes critical', () => {
    const p = diamond();
    const st = live(p, {
      A: { status: 'done', actualStart: T0, actualEnd: T0 + 10 * MIN },
      B: { status: 'done', actualStart: T0 + 10 * MIN, actualEnd: T0 + 70 * MIN },
      C: { status: 'running', actualStart: T0 + 10 * MIN },
    });
    const proj = computeProjection(p, st, T0 + 85 * MIN); // C planned end T+30, now T+85
    expect(proj.slipMin).toBe(15);
    expect(proj.steps.C.critical).toBe(true);
    expect(proj.criticalPath).toContain('C');
  });
  it('an early finish pulls successors earlier but never before now', () => {
    const p = diamond();
    const st = live(p, {
      A: { status: 'done', actualStart: T0, actualEnd: T0 + 5 * MIN },
    });
    const proj = computeProjection(p, st, T0 + 5 * MIN);
    expect(proj.steps.B.start).toBe(T0 + 5 * MIN);
    expect(proj.slipMin).toBe(-5);
  });
  it('pending steps cannot be projected to start in the past', () => {
    const p = diamond();
    const st = live(p, { A: { status: 'done', actualStart: T0, actualEnd: T0 + 10 * MIN } });
    const proj = computeProjection(p, st, T0 + 50 * MIN); // nobody started B or C for 40 minutes
    expect(proj.steps.B.start).toBe(T0 + 50 * MIN);
    expect(proj.slipMin).toBe(40);
  });
  it('uses an operator assumption and labels it as such', () => {
    const p = diamond();
    const st = live(p, {
      A: { status: 'done', actualStart: T0, actualEnd: T0 + 10 * MIN },
      B: { status: 'running', actualStart: T0 + 10 * MIN, assumedRemainingMin: 30, assumptionAt: T0 + 80 * MIN },
    });
    const proj = computeProjection(p, st, T0 + 85 * MIN);
    expect(proj.steps.B.end).toBe(T0 + 110 * MIN);
    expect(proj.steps.B.basis).toBe('assumption');
    expect(proj.assumptions.join(' ')).toMatch(/assumption, not a measurement/);
    // Once the assumed time has passed, the floor is "now".
    expect(computeProjection(p, st, T0 + 130 * MIN).steps.B.end).toBe(T0 + 130 * MIN);
  });
  it('a blocked step keeps its remaining work and slips minute for minute', () => {
    const p = diamond();
    const st = live(p, {
      A: { status: 'done', actualStart: T0, actualEnd: T0 + 10 * MIN },
      B: { status: 'blocked', actualStart: T0 + 10 * MIN, blockedAt: T0 + 30 * MIN, blockedReason: 'x' },
    });
    // 20 of 60 minutes worked, 40 remain.
    expect(computeProjection(p, st, T0 + 30 * MIN).steps.B.end).toBe(T0 + 70 * MIN);
    expect(computeProjection(p, st, T0 + 50 * MIN).steps.B.end).toBe(T0 + 90 * MIN);
  });
  it('clearing a blocker keeps the time lost while blocked', () => {
    const p = diamond();
    // B started at T+10, was blocked from T+30 to T+50: 20 minutes paused, so its planned end moves from T+70 to T+90.
    const st = live(p, {
      A: { status: 'done', actualStart: T0, actualEnd: T0 + 10 * MIN },
      B: { status: 'running', actualStart: T0 + 10 * MIN, pausedMs: 20 * MIN },
    });
    const proj = computeProjection(p, st, T0 + 50 * MIN);
    expect(proj.steps.B.end).toBe(T0 + 90 * MIN);
    expect(proj.steps.B.overrunMin).toBe(0);
  });
  it('recorded facts are never altered by the projection', () => {
    const p = diamond();
    const st = live(p, { A: { status: 'done', actualStart: T0 + 3 * MIN, actualEnd: T0 + 9 * MIN } });
    const proj = computeProjection(p, st, T0 + 200 * MIN);
    expect(proj.steps.A.start).toBe(T0 + 3 * MIN);
    expect(proj.steps.A.end).toBe(T0 + 9 * MIN);
    expect(proj.steps.A.endIsActual).toBe(true);
  });
  it('is deterministic', () => {
    const p = buildDemoPlan('x', T0, 'c');
    const st = live(p);
    expect(computeProjection(p, st, T0 + 77 * MIN)).toEqual(computeProjection(p, st, T0 + 77 * MIN));
  });
});

describe('constraints and rollback window', () => {
  const withPnr = () =>
    plan([s('A', 60), s('G', 20, ['A'], { kind: 'gate' }), s('P', 20, ['G'], { kind: 'pnr' }), s('Z', 60, ['P'], { mustFinishByMin: 200, constraintLabel: 'bank cutoff' })], {
      windowEndMin: 240,
      rollbackDurationMin: 90,
    });
  it('reports margins and breaches for the window and for step deadlines', () => {
    const p = withPnr();
    const ok = computeProjection(p, initialState(p), T0);
    expect(ok.constraints.find((c) => c.id === 'window')!.marginMin).toBe(80);
    expect(ok.constraints.find((c) => c.id === 'Z')!.marginMin).toBe(40);
    const late = computeProjection(p, live(p, { A: { status: 'running', actualStart: T0 } }), T0 + 130 * MIN); // A 70 over
    expect(late.constraints.find((c) => c.id === 'Z')!.breached).toBe(true);
    expect(late.constraints.find((c) => c.id === 'window')!.breached).toBe(false);
  });
  it('decision deadline is the earlier of the point of no return and the latest rollback start', () => {
    const p = withPnr();
    const base = computeProjection(p, live(p), T0);
    expect(base.rollback.latestRollbackStart).toBe(T0 + 150 * MIN);
    expect(base.rollback.decisionDeadline).toBe(T0 + 80 * MIN); // P starts at T+80
    expect(base.rollback.level).toBe('open');
    // A overruns: P slips past the latest rollback start, so the time limit takes over.
    const late = computeProjection(p, live(p, { A: { status: 'running', actualStart: T0 } }), T0 + 140 * MIN);
    expect(late.rollback.decisionDeadline).toBe(T0 + 150 * MIN);
    expect(late.rollback.remainingMin).toBe(10);
    expect(late.rollback.level).toBe('critical');
  });
  it('closes when time runs out or the point of no return is passed', () => {
    const p = withPnr();
    const timeout = computeProjection(p, live(p, { A: { status: 'running', actualStart: T0 } }), T0 + 151 * MIN);
    expect(timeout.rollback.level).toBe('closed');
    expect(timeout.rollback.closedReason).toBe('time-elapsed');
    const passed = computeProjection(
      p,
      live(p, {
        A: { status: 'done', actualStart: T0, actualEnd: T0 + 60 * MIN },
        G: { status: 'done', actualStart: T0 + 60 * MIN, actualEnd: T0 + 60 * MIN },
        P: { status: 'running', actualStart: T0 + 61 * MIN },
      }),
      T0 + 62 * MIN,
    );
    expect(passed.rollback.level).toBe('closed');
    expect(passed.rollback.closedReason).toBe('pnr-passed');
  });
  it('while the point of no return only waits for confirmation, the limit is the rollback time, not "now"', () => {
    const p = withPnr();
    const st = live(p, {
      A: { status: 'done', actualStart: T0, actualEnd: T0 + 60 * MIN },
      G: { status: 'done', actualStart: T0 + 60 * MIN, actualEnd: T0 + 60 * MIN },
    });
    const proj = computeProjection(p, st, T0 + 70 * MIN);
    expect(proj.rollback.pnrAwaitingConfirmation).toBe(true);
    expect(proj.rollback.decisionDeadline).toBe(T0 + 150 * MIN);
    expect(proj.rollback.remainingMin).toBe(80);
    expect(proj.rollback.level).toBe('open');
  });
  it('lists decision checkpoints that are ready for a human decision', () => {
    const p = withPnr();
    const st = live(p, { A: { status: 'done', actualStart: T0, actualEnd: T0 + 60 * MIN } });
    expect(computeProjection(p, st, T0 + 60 * MIN).awaitingDecision).toEqual(['G']);
  });
});

describe('downstream impact', () => {
  it('lists all dependants in order with their slip', () => {
    const p = diamond();
    expect(downstreamOf(p.steps, 'A')).toEqual(['B', 'C', 'D']);
    expect(downstreamOf(p.steps, 'C')).toEqual(['D']);
    const st = live(p, { A: { status: 'running', actualStart: T0 } });
    const proj = computeProjection(p, st, T0 + 25 * MIN);
    expect(impactOf(p, proj, 'A').map((i) => [i.id, i.slipMin])).toEqual([['B', 15], ['C', 15], ['D', 15]]);
  });
});
