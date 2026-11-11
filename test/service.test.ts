import { describe, expect, it } from 'vitest';
import { createService, Ctx, JiraPort } from '../src/core/service';
import { MemoryStore } from '../src/core/store';
import { DomainError, ExecEvent } from '../src/core/types';

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 14, 22, 0, 0);
const lead: Ctx = { actor: { accountId: 'lead' }, source: 'ui' };
const op: Ctx = { actor: { accountId: 'op' }, source: 'ui' };
const viewer: Ctx = { actor: { accountId: 'viewer' }, source: 'ui' };

function setup(jitter = 0) {
  let now = T0;
  const store = new MemoryStore(jitter);
  let n = 0;
  const svc = createService(store, () => now, () => `plan${++n}`);
  return { svc, store, tick: (min: number) => (now += min * MIN), now: () => now };
}
async function demo(s: ReturnType<typeof setup>) {
  const v = await s.svc.createDemoPlan(lead);
  // make "op" an owner of one step so they hold the operator role without Jira
  const p = (await s.store.getPlan(v.plan.id))!;
  p.steps.forEach((st) => { if (['INT-1', 'INT-2', 'FRZ-1'].includes(st.id)) { st.ownerId = 'op'; } });
  await s.store.putPlan(p);
  return v.plan.id;
}
const code = async (fn: () => Promise<unknown>) => { try { await fn(); return 'OK'; } catch (e) { return (e as DomainError).code ?? String(e); } };

describe('execution rules', () => {
  it('only a commander can start the plan, and only once', async () => {
    const s = setup(); const id = await demo(s);
    expect(await code(() => s.svc.execute(op, id, { type: 'startPlan' }))).toBe('FORBIDDEN');
    expect((await s.svc.execute(lead, id, { type: 'startPlan' })).state.phase).toBe('live');
    expect(await code(() => s.svc.execute(lead, id, { type: 'startPlan' }))).toBe('INVALID_STATE');
  });
  it('rejects steps before the plan is live, before dependencies are done, and by non-operators', async () => {
    const s = setup(); const id = await demo(s);
    expect(await code(() => s.svc.execute(lead, id, { type: 'startStep', stepId: 'FRZ-1' }))).toBe('INVALID_STATE');
    await s.svc.execute(lead, id, { type: 'startPlan' });
    expect(await code(() => s.svc.execute(lead, id, { type: 'startStep', stepId: 'FRZ-2' }))).toBe('INVALID_STATE');
    expect(await code(() => s.svc.execute(viewer, id, { type: 'startStep', stepId: 'FRZ-1' }))).toBe('FORBIDDEN');
    expect(await code(() => s.svc.execute(lead, id, { type: 'startStep', stepId: 'NOPE' }))).toBe('NOT_FOUND');
    expect(await code(() => s.svc.execute(lead, id, { type: 'completeStep', stepId: 'FRZ-1' }))).toBe('INVALID_STATE');
  });
  it('records server-side timestamps and the actor on every event', async () => {
    const s = setup(); const id = await demo(s);
    await s.svc.execute(lead, id, { type: 'startPlan' });
    s.tick(2);
    const v = await s.svc.execute(op, id, { type: 'startStep', stepId: 'FRZ-1' });
    const e = v.recent.at(-1)!;
    expect(e.type).toBe('STEP_STARTED');
    expect(e.at).toBe(T0 + 2 * MIN);
    expect(e.actor.accountId).toBe('op');
    expect(e.seq).toBe(2);
    expect(v.state.steps['FRZ-1'].actualStart).toBe(T0 + 2 * MIN);
  });
  it('blocker, escalation, note and assumption are recorded and reflected', async () => {
    const s = setup(); const id = await demo(s);
    await s.svc.execute(lead, id, { type: 'startPlan' });
    await s.svc.execute(op, id, { type: 'startStep', stepId: 'FRZ-1' });
    expect(await code(() => s.svc.execute(op, id, { type: 'blockStep', stepId: 'FRZ-1', reason: '  ' }))).toBe('INVALID_INPUT');
    let v = await s.svc.execute(op, id, { type: 'blockStep', stepId: 'FRZ-1', reason: 'Legacy admin account locked' });
    expect(v.state.steps['FRZ-1'].status).toBe('blocked');
    expect(v.projection.counts.blocked).toBe(1);
    v = await s.svc.execute(op, id, { type: 'escalate', stepId: 'FRZ-1', text: 'Need DBA on call' });
    expect(v.state.steps['FRZ-1'].escalated).toBe(true);
    v = await s.svc.execute(op, id, { type: 'setAssumption', stepId: 'FRZ-1', remainingMin: 25 });
    expect(v.projection.steps['FRZ-1'].basis).toBe('assumption');
    v = await s.svc.execute(op, id, { type: 'unblockStep', stepId: 'FRZ-1' });
    expect(v.state.steps['FRZ-1'].status).toBe('running');
    v = await s.svc.execute(op, id, { type: 'addNote', text: 'Bridge call open' });
    expect(v.recent.map((e) => e.type)).toEqual(['PLAN_STARTED', 'STEP_STARTED', 'STEP_BLOCKED', 'ESCALATED', 'ASSUMPTION_SET', 'STEP_UNBLOCKED', 'NOTE_ADDED']);
  });
});

describe('demo script and decisions', () => {
  it('runs the scripted lead-up and ends with the migration 45 min over and the rollback clock in warning', async () => {
    const s = setup(); const id = await demo(s);
    const v = await s.svc.runDemoScript(lead, id);
    expect(v.state.steps['MIG-3'].status).toBe('running');
    expect(v.projection.steps['MIG-3'].overrunMin).toBe(45);
    expect(v.projection.slipMin).toBe(45);
    expect(v.projection.rollback.level).toBe('warning');
    expect(v.projection.rollback.remainingMin).toBe(55);
    expect(v.projection.constraints.some((c) => c.breached)).toBe(false);
    // Real time did not move; plan time did. Audit keeps both.
    expect(v.realNow).toBe(T0);
    expect(v.planNow).toBe(T0 + 255 * MIN);
    expect(v.recent.every((e) => e.at === T0)).toBe(true);
    expect(v.recent.at(-1)!.simulated).toBe(true);
    // 30 more minutes: bank cutoff and window are projected to be missed.
    const later = await s.svc.execute(lead, id, { type: 'advanceClock', minutes: 30 });
    expect(later.projection.constraints.filter((c) => c.breached).map((c) => c.id).sort()).toEqual(['PAY-2', 'window']);
    expect(later.projection.rollback.remainingMin).toBe(45);
    expect(await code(() => s.svc.runDemoScript(lead, id))).toBe('INVALID_STATE');
  });
  it('gate decisions need an approver, satisfied dependencies and a note for anything but GO', async () => {
    const s = setup(); const id = await demo(s);
    await s.svc.runDemoScript(lead, id);
    expect(await code(() => s.svc.execute(lead, id, { type: 'decideGate', stepId: 'GATE-1', decision: 'GO', note: '' }))).toBe('INVALID_STATE');
    await s.svc.execute(lead, id, { type: 'completeStep', stepId: 'MIG-3' });
    for (const st of ['REC-1', 'REC-2']) { await s.svc.execute(lead, id, { type: 'startStep', stepId: st }); await s.svc.execute(lead, id, { type: 'completeStep', stepId: st }); }
    expect((await s.svc.getView(lead, id)).projection.awaitingDecision).toEqual(['GATE-1']);
    expect(await code(() => s.svc.execute(op, id, { type: 'decideGate', stepId: 'GATE-1', decision: 'GO', note: '' }))).toBe('FORBIDDEN');
    expect(await code(() => s.svc.execute(lead, id, { type: 'decideGate', stepId: 'GATE-1', decision: 'CONDITIONAL_GO', note: '' }))).toBe('INVALID_INPUT');
    expect(await code(() => s.svc.execute(lead, id, { type: 'startStep', stepId: 'GATE-1' }))).toBe('INVALID_STATE');
    const v = await s.svc.execute(lead, id, { type: 'decideGate', stepId: 'GATE-1', decision: 'CONDITIONAL_GO', note: 'TB variance 0.00; 3 open items parked' });
    expect(v.state.steps['GATE-1'].status).toBe('done');
    expect(v.state.steps['GATE-1'].decisionBy).toBe('lead');
    expect(await code(() => s.svc.execute(lead, id, { type: 'decideGate', stepId: 'GATE-1', decision: 'GO', note: '' }))).toBe('INVALID_STATE');
    // Point of no return: explicit confirmation by a commander only.
    expect(await code(() => s.svc.execute(lead, id, { type: 'startStep', stepId: 'PNR-1' }))).toBe('INVALID_STATE');
    expect(await code(() => s.svc.execute(op, id, { type: 'confirmPnr', stepId: 'PNR-1', note: 'go' }))).toBe('FORBIDDEN');
    expect(await code(() => s.svc.execute(lead, id, { type: 'confirmPnr', stepId: 'PNR-1', note: '' }))).toBe('INVALID_INPUT');
    const after = await s.svc.execute(lead, id, { type: 'confirmPnr', stepId: 'PNR-1', note: 'Confirmed on bridge with CFO' });
    expect(after.projection.rollback.level).toBe('closed');
    expect(after.projection.rollback.closedReason).toBe('pnr-passed');
  });
  it('a no-go halts the plan and does not start any rollback', async () => {
    const s = setup(); const id = await demo(s);
    await s.svc.runDemoScript(lead, id);
    await s.svc.execute(lead, id, { type: 'completeStep', stepId: 'MIG-3' });
    for (const st of ['REC-1', 'REC-2']) { await s.svc.execute(lead, id, { type: 'startStep', stepId: st }); await s.svc.execute(lead, id, { type: 'completeStep', stepId: st }); }
    const v = await s.svc.execute(lead, id, { type: 'decideGate', stepId: 'GATE-1', decision: 'NO_GO', note: 'Subledger out by 14,200.00' });
    expect(v.state.phase).toBe('halted');
    expect(v.recent.at(-1)!.type).toBe('GATE_DECIDED');
    expect(await code(() => s.svc.execute(lead, id, { type: 'confirmPnr', stepId: 'PNR-1', note: 'x' }))).toBe('INVALID_STATE');
    expect(v.state.steps['PNR-1'].status).toBe('pending');
  });
  it('the clock can only be advanced on simulation plans by a commander', async () => {
    const s = setup(); const id = await demo(s);
    expect(await code(() => s.svc.execute(op, id, { type: 'advanceClock', minutes: 10 }))).toBe('FORBIDDEN');
    const p = (await s.store.getPlan(id))!; p.simulation = false; await s.store.putPlan(p);
    expect(await code(() => s.svc.execute(lead, id, { type: 'advanceClock', minutes: 10 }))).toBe('FORBIDDEN');
  });
  it('the plan completes when every step is done', async () => {
    const s = setup(); const id = await demo(s);
    await s.svc.runDemoScript(lead, id);
    const go = (st: string) => s.svc.execute(lead, id, { type: 'startStep', stepId: st }).then(() => s.svc.execute(lead, id, { type: 'completeStep', stepId: st }));
    await s.svc.execute(lead, id, { type: 'completeStep', stepId: 'MIG-3' });
    await go('REC-1'); await go('REC-2');
    await s.svc.execute(lead, id, { type: 'decideGate', stepId: 'GATE-1', decision: 'GO', note: '' });
    await s.svc.execute(lead, id, { type: 'confirmPnr', stepId: 'PNR-1', note: 'confirmed' });
    await s.svc.execute(lead, id, { type: 'completeStep', stepId: 'PNR-1' });
    await go('PAY-1'); await go('PAY-2'); await go('VAL-1');
    await s.svc.execute(lead, id, { type: 'decideGate', stepId: 'GATE-2', decision: 'GO', note: '' });
    await go('COM-1');
    expect((await s.svc.getView(lead, id)).state.phase).toBe('complete');
  });
});

describe('concurrency and recovery', () => {
  it('two operators starting the same step at once: exactly one wins, the other gets a clear rejection', async () => {
    for (let round = 0; round < 15; round++) {
      const s = setup(3); const id = await demo(s);
      await s.svc.execute(lead, id, { type: 'startPlan' });
      const results = await Promise.all([lead, op].map((c) => code(() => s.svc.execute(c, id, { type: 'startStep', stepId: 'FRZ-1' }))));
      expect(results.sort()).toEqual(['INVALID_STATE', 'OK']);
      const audit = await s.svc.audit(id);
      expect(audit.filter((e) => e.type === 'STEP_STARTED')).toHaveLength(1);
      expect(audit.map((e) => e.seq)).toEqual([1, 2]);
    }
  });
  it('many concurrent independent commands all land, in a gapless sequence', async () => {
    const s = setup(3); const id = await demo(s);
    await s.svc.execute(lead, id, { type: 'startPlan' });
    const cmds = Array.from({ length: 5 }, (_, i) => s.svc.execute(i % 2 ? op : lead, id, { type: 'addNote', text: `note ${i}` }));
    await Promise.all(cmds);
    const audit = await s.svc.audit(id);
    expect(audit.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(audit.filter((e) => e.type === 'NOTE_ADDED').map((e) => e.text)).size).toBe(5);
  });
  it('a stale client is told the truth and receives fresh state on the next read', async () => {
    const s = setup(); const id = await demo(s);
    await s.svc.execute(lead, id, { type: 'startPlan' });
    const stale = await s.svc.getView(op, id); // op loads the board
    await s.svc.execute(lead, id, { type: 'startStep', stepId: 'FRZ-1' }); // lead acts meanwhile
    expect((await s.svc.poll(id)).seq).toBeGreaterThan(stale.seq); // polling notices
    let err: DomainError | undefined;
    try { await s.svc.execute(op, id, { type: 'startStep', stepId: 'FRZ-1' }); } catch (e) { err = e as DomainError; }
    expect(err?.code).toBe('INVALID_STATE');
    expect(err?.message).toMatch(/FRZ-1 is already running/);
    expect((await s.svc.getView(op, id)).state.steps['FRZ-1'].status).toBe('running');
  });
  it('state is rebuilt from the event log when snapshot and head are lost or stale', async () => {
    const s = setup(); const id = await demo(s);
    const v = await s.svc.runDemoScript(lead, id);
    const raw = s.store as unknown as { data: Map<string, unknown> };
    raw.data.delete(`snap:${id}`);
    raw.data.set(`head:${id}`, 3);
    expect((await s.svc.poll(id)).seq).toBe(v.seq);
    const again = await s.svc.getView(lead, id);
    expect(again.seq).toBe(v.seq);
    expect(again.state).toEqual(v.state);
  });
  it('the audit trail is complete, ordered and append-only', async () => {
    const s = setup(); const id = await demo(s);
    const v = await s.svc.runDemoScript(lead, id);
    const audit = await s.svc.audit(id);
    expect(audit).toHaveLength(v.seq);
    expect(audit.map((e) => e.seq)).toEqual(Array.from({ length: v.seq }, (_, i) => i + 1));
    const dupe: ExecEvent = { ...audit[4], text: 'tampered' };
    expect(await s.store.appendEvent(id, dupe)).toBe(false);
    expect((await s.svc.audit(id))[4]).toEqual(audit[4]);
  });
  it('reset: deleting a plan removes it, and readers get a clear not-found', async () => {
    const s = setup(); const id = await demo(s);
    await s.svc.runDemoScript(lead, id);
    expect(await code(() => s.svc.deletePlan(op, id))).toBe('FORBIDDEN');
    await s.svc.deletePlan(lead, id);
    expect(await code(() => s.svc.getView(lead, id))).toBe('NOT_FOUND');
    expect((await s.svc.poll(id)).exists).toBe(false);
    expect(await s.svc.listPlans()).toEqual([]);
  });
});

describe('Jira side effects and permissions', () => {
  it('transitions the linked issue, comments on blockers, and reports failures as warnings without losing the event', async () => {
    const calls: string[] = [];
    const jira: JiraPort = {
      canEdit: async () => true,
      transition: async (k, t) => { calls.push(`transition ${k} ${t}`); return t === 'done' ? { ok: false, message: 'no transition to a Done status' } : { ok: true }; },
      comment: async (k, t) => { calls.push(`comment ${k} ${t}`); return { ok: true }; },
      importSteps: async () => [],
      userNames: async (ids) => Object.fromEntries(ids.filter((i) => i === 'lead').map((i) => [i, 'Lena Lead'])),
      createIssues: async (_p, steps) => Object.fromEntries(steps.map((st, i) => [st.id, `CUT-${i + 1}`])),
    };
    const s = setup();
    const ctx: Ctx = { ...lead, jira };
    const v0 = await s.svc.createDemoPlan(ctx, { projectKey: 'CUT', createIssues: true });
    expect(v0.plan.steps[0].issueKey).toBe('CUT-1');
    const id = v0.plan.id;
    await s.svc.execute(ctx, id, { type: 'startPlan' });
    await s.svc.execute(ctx, id, { type: 'startStep', stepId: 'FRZ-1' });
    await s.svc.execute(ctx, id, { type: 'blockStep', stepId: 'FRZ-1', reason: 'locked' });
    await s.svc.execute(ctx, id, { type: 'unblockStep', stepId: 'FRZ-1' });
    const v = await s.svc.execute(ctx, id, { type: 'completeStep', stepId: 'FRZ-1' });
    expect(calls).toEqual(['transition CUT-1 indeterminate', 'comment CUT-1 T-Minus: step marked blocked. locked', 'transition CUT-1 done']);
    expect(v.warnings[0]).toMatch(/did not apply/);
    expect(v.state.steps['FRZ-1'].status).toBe('done');
  });
  it('a user with Jira edit permission on the project is an operator; one without is read-only', async () => {
    const mk = (can: boolean): JiraPort => ({ canEdit: async () => can, transition: async () => ({ ok: true }), comment: async () => ({ ok: true }), importSteps: async () => [], createIssues: async () => ({}), userNames: async () => ({}) });
    const s = setup();
    const v0 = await s.svc.createDemoPlan({ ...lead, jira: mk(true) }, { projectKey: 'CUT' });
    await s.svc.execute({ ...lead, jira: mk(true) }, v0.plan.id, { type: 'startPlan' });
    expect((await s.svc.getView({ ...viewer, jira: mk(false) }, v0.plan.id)).roles).toEqual({ commander: false, approver: false, operator: false });
    expect(await code(() => s.svc.execute({ ...viewer, jira: mk(false) }, v0.plan.id, { type: 'startStep', stepId: 'FRZ-1' }))).toBe('FORBIDDEN');
    expect(await code(() => s.svc.execute({ ...viewer, jira: mk(true) }, v0.plan.id, { type: 'startStep', stepId: 'FRZ-1' }))).toBe('OK');
  });
});

describe('situation report for the agent', () => {
  it('reports only recorded facts and engine output', async () => {
    const s = setup(); const id = await demo(s);
    expect((await createService(new MemoryStore()).situation()).found).toBe(false);
    await s.svc.runDemoScript(lead, id);
    await s.svc.execute(op, id, { type: 'setAssumption', stepId: 'MIG-3', remainingMin: 20 });
    const sit = await s.svc.situation();
    if (!sit.found) throw new Error('expected a plan');
    expect(sit.plan.phase).toBe('live');
    expect(sit.clock.simulatedClock).toBe(true);
    expect(sit.inProgress.map((x) => x.id)).toEqual(['MIG-3']);
    expect(sit.inProgress[0].overrunMin).toBe(45);
    expect(sit.inProgress[0].operatorAssumptionRemainingMin).toBe(20);
    expect(sit.schedule.slipMin).toBe(65);
    // With 20 more minutes assumed, the point of no return moves to T+330, the same as the latest rollback start.
    expect(sit.rollback.level).toBe('open');
    expect(sit.rollback.remainingMin).toBe(75);
    expect(sit.projectionAssumptions.join(' ')).toMatch(/assumption/);
    expect(sit.plan.phaseMeaning).toBe('in progress');
    expect(sit.rollback.limitedBy).toMatch(/90 minutes a rollback needs|point of no return/);
    const impact = await s.svc.stepImpact(id, 'MIG-3');
    expect(impact.map((i) => i.id)).toEqual(['REC-1', 'REC-2', 'GATE-1', 'PNR-1', 'PAY-1', 'VAL-1', 'PAY-2', 'GATE-2', 'COM-1']);
    expect(impact.every((i) => i.slipMin === 65)).toBe(true);
  });
});

describe('on-platform self-test', () => {
  it('passes against a correct store and leaves nothing behind', async () => {
    const s = setup(2);
    const r = await s.svc.selfTest(lead);
    expect(r.checks.map((c) => [c.name, c.pass])).toEqual(r.checks.map((c) => [c.name, true]));
    expect(r.passed).toBe(true);
    expect([...(s.store as unknown as { data: Map<string, unknown> }).data.keys()]).toEqual([]);
  });
  it('fails against a store whose create-if-absent does not hold', async () => {
    const s = setup();
    s.store.appendEvent = async (id, e) => { (s.store as any).data.set(`evt:${id}:${e.seq}`, e); return true; };
    const r = await s.svc.selfTest(lead);
    expect(r.passed).toBe(false);
  });
});

describe('chunked demo script', () => {
  it('runs in several short calls and ends in the same state as one long run', async () => {
    const a = setup(); const idA = await demo(a);
    const whole = await a.svc.runDemoScript(lead, idA);
    const b = setup(); const idB = await demo(b);
    let cursor: number | null = 0; let calls = 0; let last;
    while (cursor !== null) { const r = await b.svc.runDemoScriptChunk(lead, idB, cursor, -1); last = r.view; cursor = r.next; calls++; }
    expect(calls).toBeGreaterThan(20); // a negative budget forces one command per call
    expect(last!.state).toEqual(whole.state);
    expect(last!.seq).toBe(whole.seq);
  });
  it('rejects a bad position and a restart on a running plan', async () => {
    const s = setup(); const id = await demo(s);
    expect(await code(() => s.svc.runDemoScriptChunk(lead, id, 999))).toBe('INVALID_INPUT');
    await s.svc.runDemoScript(lead, id);
    expect(await code(() => s.svc.runDemoScriptChunk(lead, id, 0))).toBe('INVALID_STATE');
  });
  it('continues after steps that a person already did by hand', async () => {
    const s = setup(); const id = await demo(s);
    await s.svc.execute(lead, id, { type: 'startPlan' });
    await s.svc.execute(lead, id, { type: 'startStep', stepId: 'FRZ-1' });
    await s.svc.execute(lead, id, { type: 'advanceClock', minutes: 15 });
    await s.svc.execute(lead, id, { type: 'completeStep', stepId: 'FRZ-1' });
    const v = await s.svc.runDemoScript(lead, id);
    expect(v.state.steps['MIG-3'].status).toBe('running');
    expect(v.projection.steps['MIG-3'].overrunMin).toBe(45);
    expect(v.recent.filter((e) => e.type === 'PLAN_STARTED' || (e.type === 'STEP_STARTED' && e.stepId === 'FRZ-1')).length).toBeLessThanOrEqual(2);
  });
});

describe('personal data', () => {
  it('stores account ids only: no display name in the plan, the events or the snapshot', async () => {
    const names: JiraPort['userNames'] = async (ids) => Object.fromEntries(ids.map((i) => [i, `Name Of ${i}`]));
    const jira: JiraPort = { canEdit: async () => true, transition: async () => ({ ok: true }), comment: async () => ({ ok: true }), importSteps: async () => [], createIssues: async () => ({}), userNames: names };
    const s = setup();
    const ctx: Ctx = { ...lead, jira };
    const v0 = await s.svc.createDemoPlan(ctx, { projectKey: 'CUT' });
    const v = await s.svc.runDemoScript(ctx, v0.plan.id);
    await s.svc.execute(ctx, v0.plan.id, { type: 'setAssumption', stepId: 'MIG-3', remainingMin: 10 });
    // Names are present in the response...
    expect(v.names.lead).toBe('Name Of lead');
    // ...but nowhere in what was written to storage.
    const stored = JSON.stringify([...(s.store as unknown as { data: Map<string, unknown> }).data.entries()]);
    expect(stored).not.toContain('Name Of');
    expect(stored).not.toContain('displayName');
    expect(stored).not.toContain('ownerName');
    expect(stored).toContain('"accountId":"lead"');
  });
  it('a failing name lookup never fails a read', async () => {
    const jira: JiraPort = { canEdit: async () => true, transition: async () => ({ ok: true }), comment: async () => ({ ok: true }), importSteps: async () => [], createIssues: async () => ({}), userNames: async () => { throw new Error('boom'); } };
    const s = setup();
    const v = await s.svc.createDemoPlan({ ...lead, jira }, { projectKey: 'CUT' });
    expect(v.names).toEqual({});
  });
});

describe('demo reset', () => {
  it('replaces the plan, keeps the same Jira issues and moves them back to a to-do status', async () => {
    const calls: string[] = [];
    const jira: JiraPort = {
      canEdit: async () => true,
      transition: async (k, target) => { calls.push(`${k}:${target}`); return k === 'CUT-3' && target === 'new' ? { ok: false, message: 'no transition' } : { ok: true }; },
      comment: async () => ({ ok: true }), importSteps: async () => [], userNames: async () => ({}),
      createIssues: async (_p, steps) => Object.fromEntries(steps.map((st, i) => [st.id, `CUT-${i + 1}`])),
    };
    const s = setup(); const ctx: Ctx = { ...lead, jira };
    const v0 = await s.svc.createDemoPlan(ctx, { projectKey: 'CUT', createIssues: true });
    await s.svc.runDemoScript(ctx, v0.plan.id);
    calls.length = 0;
    const v = await s.svc.resetDemoPlan(ctx, v0.plan.id);
    expect(v.plan.id).not.toBe(v0.plan.id);
    expect(v.state.phase).toBe('ready');
    expect(v.seq).toBe(0);
    expect(v.plan.steps.map((st) => st.issueKey)).toEqual(v0.plan.steps.map((st) => st.issueKey));
    expect(calls.filter((c) => c.endsWith(':new'))).toHaveLength(17);
    expect(v.warnings.join(' ')).toMatch(/1 Jira issue/);
    expect(await code(() => s.svc.getView(ctx, v0.plan.id))).toBe('NOT_FOUND');
    expect((await s.svc.listPlans()).map((x) => x.id)).toEqual([v.plan.id]);
    expect(await code(() => s.svc.resetDemoPlan({ ...op, jira }, v.plan.id))).toBe('FORBIDDEN');
    // The scripted run works again on the reset plan.
    expect((await s.svc.runDemoScript(ctx, v.plan.id)).projection.steps['MIG-3'].overrunMin).toBe(45);
  });
});
