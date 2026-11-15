// Application service: every UI, Rovo and web-trigger entry point goes through here.
import { buildDemoPlan, demoScript } from './demo';
import { computeProjection, impactOf, validatePlan } from './engine';
import { apply, decide, initialState, Roles, rolesFor } from './events';
import { PlanSummary, Snapshot, Store } from './store';
import { Actor, Command, DomainError, ExecEvent, ExecState, PlanDef, Projection, StepDef } from './types';

export interface JiraPort {
  /** Can the acting user edit issues in this project? */
  canEdit(projectKey: string): Promise<boolean>;
  /** Can the acting user see this project? Plans of a project are only shown to people who can browse it. */
  canBrowse?(projectKey: string): Promise<boolean>;
  /** Move the issue to a status in the given category. Best effort. */
  transition(issueKey: string, target: 'new' | 'indeterminate' | 'done'): Promise<{ ok: boolean; message?: string }>;
  comment(issueKey: string, text: string): Promise<{ ok: boolean; message?: string }>;
  /** Read issues of a project and map them to steps (links of type "Blocks" become dependencies). */
  importSteps(projectKey: string, jql?: string): Promise<StepDef[]>;
  /** Create one Jira issue per step, link dependencies, return stepId -> issueKey. */
  createIssues(projectKey: string, steps: StepDef[]): Promise<Record<string, string>>;
  /** Look up display names for account ids. Called at read time only; results are never stored. */
  userNames(accountIds: string[]): Promise<Record<string, string>>;
}

/** Plan time as an offset from the planned start, with the UTC clock time: "T+4:46 (03:46 UTC)". */
function planTimeLabel(p: PlanDef) {
  return (ms: number) => {
    const m = Math.round((ms - p.plannedStart) / 60_000);
    const abs = Math.abs(m);
    return `T${m < 0 ? '-' : '+'}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')} (${new Date(ms).toISOString().slice(11, 16)} UTC)`;
  };
}

export type NameResolver = (accountIds: string[]) => Promise<Record<string, string>>;

export interface Ctx {
  actor: Actor;
  source: ExecEvent['source'];
  jira?: JiraPort;
}

export interface View {
  plan: PlanDef;
  state: ExecState;
  seq: number;
  projection: Projection;
  roles: Roles;
  recent: ExecEvent[];
  realNow: number;
  planNow: number;
  warnings: string[];
  /** accountId -> display name, looked up for this response only. Missing entries mean the name could not be read. */
  names: Record<string, string>;
}

const RECENT = 80;
const MAX_RETRIES = 6;

interface Snap extends Snapshot {
  recent: ExecEvent[];
}

export function createService(store: Store, clock: () => number = () => Date.now(), newId: () => string = defaultId) {
  async function plan(planId: string): Promise<PlanDef> {
    const p = await store.getPlan(planId);
    if (!p) throw new DomainError('NOT_FOUND', 'This plan does not exist (it may have been reset).');
    return p;
  }

  /** Load state = snapshot + any events written after it. Repairs snapshot and head when they lag. */
  async function load(p: PlanDef): Promise<Snap> {
    const stored = (await store.getSnapshot(p.id)) as Snap | undefined;
    let snap: Snap = stored ?? { seq: 0, state: initialState(p), recent: [] };
    let advanced = false;
    for (;;) {
      const e = await store.getEvent(p.id, snap.seq + 1);
      if (!e) break;
      snap = { seq: e.seq, state: apply(p, snap.state, e), recent: [...snap.recent, e].slice(-RECENT) };
      advanced = true;
    }
    if (advanced) {
      await store.putSnapshot(p.id, snap);
      await store.setHead(p.id, snap.seq);
    }
    return snap;
  }

  /** Plans linked to a Jira project are readable only by people who can browse that project. */
  async function visible(ctx: Ctx, projectKey?: string): Promise<boolean> {
    if (!projectKey || !ctx.jira?.canBrowse) return true;
    try {
      return await ctx.jira.canBrowse(projectKey);
    } catch {
      return false;
    }
  }

  async function readable(ctx: Ctx, planId: string): Promise<PlanDef> {
    const p = await plan(planId);
    if (!(await visible(ctx, p.projectKey))) throw new DomainError('FORBIDDEN', 'You do not have access to the Jira project of this plan.');
    return p;
  }

  async function visiblePlans(ctx: Ctx): Promise<PlanSummary[]> {
    const list = await store.listPlans();
    const keys = [...new Set(list.map((x) => x.projectKey).filter(Boolean) as string[])];
    const ok = new Map(await Promise.all(keys.map(async (k) => [k, await visible(ctx, k)] as const)));
    return list.filter((x) => !x.projectKey || ok.get(x.projectKey));
  }

  async function rolesOf(ctx: Ctx, p: PlanDef): Promise<Roles> {
    let canEdit = false;
    if (p.projectKey && ctx.jira) {
      try {
        canEdit = await ctx.jira.canEdit(p.projectKey);
      } catch {
        canEdit = false;
      }
    }
    return rolesFor(p, ctx.actor.accountId, canEdit);
  }

  function view(p: PlanDef, snap: Snap, roles: Roles, warnings: string[] = []): View {
    const realNow = clock();
    const planNow = realNow + snap.state.clockOffsetMs;
    return {
      plan: p,
      state: snap.state,
      seq: snap.seq,
      projection: computeProjection(p, snap.state, planNow),
      roles,
      recent: snap.recent,
      names: {},
      realNow,
      planNow,
      warnings,
    };
  }

  function accountIdsOf(p: PlanDef, snap: Snap): string[] {
    const ids = new Set<string>([...p.commanders, ...p.approvers]);
    for (const s of p.steps) if (s.ownerId) ids.add(s.ownerId);
    for (const e of snap.recent) ids.add(e.actor.accountId);
    for (const x of Object.values(snap.state.steps))
      for (const id of [x.startedBy, x.completedBy, x.decisionBy, x.assumptionBy]) if (id) ids.add(id);
    return [...ids];
  }

  async function resolveNames(resolver: NameResolver | undefined, ids: string[]): Promise<Record<string, string>> {
    if (!resolver || ids.length === 0) return {};
    try {
      return await resolver(ids);
    } catch {
      return {}; // names are a display nicety; never fail a read because of them
    }
  }

  async function named(ctx: Ctx, p: PlanDef, snap: Snap, v: View): Promise<View> {
    v.names = await resolveNames(ctx.jira ? (ids) => ctx.jira!.userNames(ids) : undefined, accountIdsOf(p, snap));
    return v;
  }

  /** Append one validated event with optimistic concurrency. Retries when another writer wins the slot. */
  async function commit(p: PlanDef, cmd: Command, ctx: Ctx, roles: Roles): Promise<{ snap: Snap; event: ExecEvent }> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const snap = await load(p);
      const event = decide(p, snap.state, cmd, ctx.actor, roles, clock(), ctx.source, snap.seq + 1);
      if (await store.appendEvent(p.id, event)) {
        const next: Snap = { seq: event.seq, state: apply(p, snap.state, event), recent: [...snap.recent, event].slice(-RECENT) };
        await store.putSnapshot(p.id, next);
        await store.setHead(p.id, next.seq);
        return { snap: next, event };
      }
      // Someone else wrote this sequence number. Loop: reload and re-validate against the new state.
    }
    throw new DomainError('CONFLICT', 'The plan is changing too quickly. Refresh and try again.');
  }

  async function sideEffects(p: PlanDef, e: ExecEvent, ctx: Ctx): Promise<string[]> {
    const warnings: string[] = [];
    if (!ctx.jira || !e.stepId) return warnings;
    const key = p.steps.find((s) => s.id === e.stepId)?.issueKey;
    if (!key) return warnings;
    const run = async (label: string, fn: () => Promise<{ ok: boolean; message?: string }>) => {
      try {
        const r = await fn();
        if (!r.ok) warnings.push(`${label} for ${key} did not apply: ${r.message ?? 'unknown reason'}`);
      } catch (err) {
        warnings.push(`${label} for ${key} failed: ${(err as Error).message}`);
      }
    };
    if (e.type === 'STEP_STARTED' || e.type === 'PNR_CONFIRMED') await run('Jira status update', () => ctx.jira!.transition(key, 'indeterminate'));
    if (e.type === 'STEP_COMPLETED' || (e.type === 'GATE_DECIDED' && e.decision !== 'NO_GO')) await run('Jira status update', () => ctx.jira!.transition(key, 'done'));
    if (e.type === 'STEP_BLOCKED') await run('Jira comment', () => ctx.jira!.comment(key, `T-Minus: step marked blocked. ${e.text}`));
    if (e.type === 'ESCALATED') await run('Jira comment', () => ctx.jira!.comment(key, `T-Minus: escalated. ${e.text}`));
    if (e.type === 'GATE_DECIDED') await run('Jira comment', () => ctx.jira!.comment(key, `T-Minus: decision ${e.decision} recorded. ${e.text ?? ''}`));
    if (e.type === 'PNR_CONFIRMED') await run('Jira comment', () => ctx.jira!.comment(key, `T-Minus: point of no return passed and confirmed. ${e.text ?? ''}`));
    return warnings;
  }

  return {
    async listPlans(ctx?: Ctx): Promise<PlanSummary[]> {
      return ctx ? visiblePlans(ctx) : store.listPlans();
    },

    async getView(ctx: Ctx, planId: string): Promise<View> {
      const p = await readable(ctx, planId);
      const snap = await load(p);
      return named(ctx, p, snap, view(p, snap, await rolesOf(ctx, p)));
    },

    /** Cheap call for polling clients: the latest sequence number only. */
    async poll(planId: string): Promise<{ seq: number; exists: boolean }> {
      const head = await store.getHead(planId);
      if (await store.getEvent(planId, head + 1)) {
        const p = await store.getPlan(planId);
        if (!p) return { seq: head, exists: false };
        return { seq: (await load(p)).seq, exists: true };
      }
      if (head === 0 && !(await store.getPlan(planId))) return { seq: 0, exists: false };
      return { seq: head, exists: true };
    },

    async execute(ctx: Ctx, planId: string, cmd: Command): Promise<View> {
      const p = await readable(ctx, planId);
      const roles = await rolesOf(ctx, p);
      const { snap, event } = await commit(p, cmd, ctx, roles);
      const warnings = await sideEffects(p, event, ctx);
      return named(ctx, p, snap, view(p, snap, roles, warnings));
    },

    async createDemoPlan(ctx: Ctx, opts: { projectKey?: string; createIssues?: boolean } = {}): Promise<View> {
      const now = clock();
      const p = buildDemoPlan(newId(), now, ctx.actor.accountId, opts.projectKey);
      p.steps.forEach((s) => (s.ownerId = ctx.actor.accountId));
      const warnings: string[] = [];
      if (opts.projectKey && opts.createIssues && ctx.jira) {
        try {
          const keys = await ctx.jira.createIssues(opts.projectKey, p.steps);
          p.steps.forEach((s) => (s.issueKey = keys[s.id]));
        } catch (err) {
          warnings.push(`Jira issues were not created: ${(err as Error).message}`);
        }
      }
      return this.savePlan(ctx, p, warnings);
    },

    /**
     * Replace a demo plan with a fresh one that keeps the same Jira issues, moved back to a "to do" status.
     * The old plan and its audit trail are deleted; the Jira issues keep their own history.
     */
    async resetDemoPlan(ctx: Ctx, planId: string): Promise<View> {
      const old = await plan(planId);
      if (!old.simulation) throw new DomainError('FORBIDDEN', 'Only a simulation plan can be reset.');
      if (!old.commanders.includes(ctx.actor.accountId)) throw new DomainError('FORBIDDEN', 'Only a cutover commander can reset the demo.');
      const oldSnap = await load(old);
      const keys = Object.fromEntries(old.steps.filter((s) => s.issueKey).map((s) => [s.id, s.issueKey!]));
      const p = buildDemoPlan(newId(), clock(), ctx.actor.accountId, old.projectKey);
      p.steps.forEach((s) => {
        s.ownerId = ctx.actor.accountId;
        if (keys[s.id]) s.issueKey = keys[s.id];
      });
      const warnings: string[] = [];
      if (ctx.jira) {
        const issueKeys = Object.values(keys);
        let failed = 0;
        for (let i = 0; i < issueKeys.length; i += 6) {
          const results = await Promise.all(
            issueKeys.slice(i, i + 6).map((k) => ctx.jira!.transition(k, 'new').catch(() => ({ ok: false }))),
          );
          failed += results.filter((r) => !r.ok).length;
        }
        if (failed) warnings.push(`${failed} Jira issue(s) could not be moved back to a "to do" status. They keep their current status.`);
      }
      await store.savePlanList((await store.listPlans()).filter((x) => x.id !== planId));
      await store.deletePlan(planId, oldSnap.seq);
      return this.savePlan(ctx, p, warnings);
    },

    async importPlan(
      ctx: Ctx,
      opts: { projectKey: string; jql?: string; name: string; windowEndMin: number; rollbackDurationMin: number; plannedStart?: number; simulation?: boolean },
    ): Promise<View> {
      if (!ctx.jira) throw new DomainError('INVALID_STATE', 'Jira is not available in this context.');
      const steps = await ctx.jira.importSteps(opts.projectKey, opts.jql);
      const now = clock();
      const p: PlanDef = {
        id: newId(),
        name: opts.name.trim() || `Cutover ${opts.projectKey}`,
        projectKey: opts.projectKey,
        plannedStart: opts.plannedStart ?? Math.floor(now / 60_000) * 60_000,
        windowEndMin: opts.windowEndMin,
        windowLabel: 'Cutover window ends',
        rollbackDurationMin: opts.rollbackDurationMin,
        commanders: [ctx.actor.accountId],
        approvers: [ctx.actor.accountId],
        simulation: !!opts.simulation,
        createdBy: ctx.actor.accountId,
        createdAt: now,
        steps,
      };
      return this.savePlan(ctx, p, []);
    },

    async savePlan(ctx: Ctx, p: PlanDef, warnings: string[]): Promise<View> {
      const issues = validatePlan(p.steps);
      if (issues.length) throw new DomainError('INVALID_PLAN', issues.map((i) => i.message).join(' '));
      await store.putPlan(p);
      const list = await store.listPlans();
      list.unshift({ id: p.id, name: p.name, projectKey: p.projectKey, simulation: p.simulation, createdAt: p.createdAt });
      await store.savePlanList(list.slice(0, 50));
      const snap = await load(p);
      return named(ctx, p, snap, view(p, snap, await rolesOf(ctx, p), warnings));
    },

    async deletePlan(ctx: Ctx, planId: string): Promise<void> {
      const p = await plan(planId);
      if (!p.commanders.includes(ctx.actor.accountId)) throw new DomainError('FORBIDDEN', 'Only a cutover commander can delete a plan.');
      const snap = await load(p);
      await store.savePlanList((await store.listPlans()).filter((x) => x.id !== planId));
      await store.deletePlan(planId, snap.seq);
    },

    /** Reviewer shortcut on simulation plans: run the scripted lead-up through the normal command path. */
    /** Runs the whole demo script. Used by tests; the UI calls runDemoScriptChunk so no single call runs long. */
    async runDemoScript(ctx: Ctx, planId: string): Promise<View> {
      let cursor: number | null = 0;
      let last: View | undefined;
      while (cursor !== null) {
        const r: { view: View; next: number | null } = await this.runDemoScriptChunk(ctx, planId, cursor, Number.POSITIVE_INFINITY);
        last = r.view;
        cursor = r.next;
      }
      return last!;
    },

    /**
     * Runs demo-script commands starting at `cursor` until the time budget is used, then returns where to continue.
     * Every command still goes through normal validation, so a wrong cursor is rejected by the state rules.
     */
    async runDemoScriptChunk(ctx: Ctx, planId: string, cursor: number, budgetMs = 8000): Promise<{ view: View; next: number | null }> {
      const p = await readable(ctx, planId);
      if (!p.simulation) throw new DomainError('FORBIDDEN', 'The demo script only runs on a simulation plan.');
      const script = demoScript();
      if (!Number.isInteger(cursor) || cursor < 0 || cursor >= script.length) throw new DomainError('INVALID_INPUT', 'Invalid demo script position.');
      const roles = await rolesOf(ctx, p);
      let snap = await load(p);
      if (cursor === 0 && snap.state.steps['MIG-3']?.status !== 'pending')
        throw new DomainError('INVALID_STATE', 'The demo script has already run on this plan. Reset the demo first.');
      const warnings: string[] = [];
      const startedAt = Date.now();
      let i = cursor;
      for (; i < script.length; i++) {
        if (i > cursor && Date.now() - startedAt > budgetMs) break;
        const cmd = script[i];
        try {
          const r = await commit(p, cmd, ctx, roles);
          snap = r.snap;
          warnings.push(...(await sideEffects(p, r.event, ctx)));
        } catch (err) {
          // Steps a person already did by hand before starting the script are skipped, not failed.
          if (!(err instanceof DomainError) || err.code !== 'INVALID_STATE' || !alreadyDone(cmd, (await load(p)).state)) throw err;
        }
      }
      return { view: await named(ctx, p, snap, view(p, snap, roles, [...new Set(warnings)])), next: i < script.length ? i : null };
    },

    async audit(planId: string, ctx?: Ctx): Promise<ExecEvent[]> {
      const p = ctx ? await readable(ctx, planId) : await plan(planId);
      const snap = await load(p);
      const out: ExecEvent[] = [];
      for (let from = 1; from <= snap.seq; from += 20) {
        const batch = await Promise.all(
          Array.from({ length: Math.min(20, snap.seq - from + 1) }, (_, i) => store.getEvent(planId, from + i)),
        );
        for (const e of batch) if (e) out.push(e);
      }
      return out;
    },

    /** Read model for the Rovo agent. Every number comes from recorded state or the deterministic engine. */
    async situation(planId?: string, resolver?: NameResolver, ctx?: Ctx) {
      const list = ctx ? await visiblePlans(ctx) : await store.listPlans();
      const id = planId ?? list[0]?.id;
      if (!id) return { found: false as const, message: 'No cutover plan exists yet.' };
      const p = await store.getPlan(id);
      if (p && ctx && !(await visible(ctx, p.projectKey))) throw new DomainError('FORBIDDEN', 'You do not have access to the Jira project of this plan.');
      if (!p) return { found: false as const, message: `Plan ${id} was not found.`, plans: list.map((x) => ({ id: x.id, name: x.name })) };
      const snap = await load(p);
      const realNow = clock();
      const planNow = realNow + snap.state.clockOffsetMs;
      const proj = computeProjection(p, snap.state, planNow);
      // Times are given as an offset from the planned start ("T+4:46"), which is what the board shows next to every clock time.
      const t = planTimeLabel(p);
      const title = (sid: string) => p.steps.find((s) => s.id === sid)!.title;
      const names = await resolveNames(resolver, accountIdsOf(p, snap));
      const person = (id?: string) => (id ? names[id] ?? 'a team member (name unavailable)' : undefined);
      const stepInfo = (sid: string) => {
        const s = proj.steps[sid];
        const x = snap.state.steps[sid];
        return {
          id: sid,
          title: title(sid),
          status: x.status,
          owner: person(p.steps.find((q) => q.id === sid)!.ownerId),
          onCriticalPath: s.critical,
          overrunMin: s.overrunMin,
          slipVsBaselineMin: s.slipMin,
          projectedOrActualEnd: t(s.end),
          endIsRecordedFact: s.endIsActual,
          projectionBasis: s.basis,
          blockedReason: x.blockedReason,
          escalated: !!x.escalated,
          operatorAssumptionRemainingMin: x.assumedRemainingMin,
        };
      };
      const inProgress = proj.order.filter((sid) => ['running', 'blocked'].includes(snap.state.steps[sid].status));
      return {
        found: true as const,
        dataKinds: {
          recordedFacts: 'statuses, actual start/end times, decisions, notes',
          deterministicProjections: 'projected ends, slip, critical path, constraint margins, rollback window',
          userAssumptions: 'operator-entered remaining minutes',
        },
        plan: {
          id: p.id,
          name: p.name,
          phase: snap.state.phase,
          phaseMeaning: { ready: 'not started', live: 'in progress', halted: 'stopped because a no-go decision was recorded', complete: 'all steps done' }[snap.state.phase],
          simulation: p.simulation,
          haltedReason: snap.state.haltedReason,
        },
        clock: { planTimeNow: t(planNow), simulatedClock: snap.state.clockOffsetMs !== 0, realTimeNow: t(realNow) },
        progress: proj.counts,
        schedule: {
          baselineFinish: t(proj.baselineFinish),
          projectedFinish: t(proj.projectedFinish),
          slipMin: proj.slipMin,
          criticalPath: proj.criticalPath.filter((sid) => snap.state.steps[sid].status !== 'done'),
        },
        constraints: proj.constraints.map((c) => ({ label: c.label, deadline: t(c.deadline), projected: t(c.projected), marginMin: c.marginMin, projectedBreach: c.breached })),
        rollback: {
          level: proj.rollback.level,
          decisionDeadline: t(proj.rollback.decisionDeadline),
          remainingMin: proj.rollback.remainingMin,
          latestRollbackStart: t(proj.rollback.latestRollbackStart),
          rollbackDurationMin: p.rollbackDurationMin,
          pointOfNoReturnStep: proj.rollback.pnrStepId,
          closedReason: proj.rollback.closedReason,
          pointOfNoReturnAwaitingConfirmation: proj.rollback.pnrAwaitingConfirmation,
          // What limits the window, worked out by the engine so the agent does not have to infer it.
          limitedBy:
            proj.rollback.level === 'closed'
              ? proj.rollback.closedReason === 'pnr-passed'
                ? 'closed: the point of no return has been passed'
                : `closed: a ${p.rollbackDurationMin}-minute rollback can no longer finish before the cutover window ends`
              : proj.rollback.pnrAwaitingConfirmation
                ? `rollback stays possible until ${proj.rollback.pnrStepId} is confirmed, and no later than the ${p.rollbackDurationMin} minutes a rollback needs before the cutover window ends`
                : proj.rollback.pnrStart !== undefined && proj.rollback.decisionDeadline === proj.rollback.pnrStart
                  ? `the projected start of the point of no return (${proj.rollback.pnrStepId})`
                  : `the ${p.rollbackDurationMin} minutes a rollback needs before the cutover window ends`,
          note: 'T-Minus never starts a rollback. It only reports the decision window.',
        },
        inProgress: inProgress.map(stepInfo),
        delayed: proj.order.filter((sid) => snap.state.steps[sid].status !== 'done' && proj.steps[sid].slipMin > 0).map(stepInfo),
        awaitingDecision: proj.awaitingDecision.map((sid) => ({ id: sid, title: title(sid), kind: p.steps.find((q) => q.id === sid)!.kind })),
        // Decisions not yet open: go/no-go checkpoints and the point of no return, with when they are projected to come up.
        upcomingDecisions: p.steps
          .filter((s) => (s.kind === 'gate' || s.kind === 'pnr') && snap.state.steps[s.id].status !== 'done' && !proj.awaitingDecision.includes(s.id))
          .map((s) => ({
            id: s.id,
            title: s.title,
            kind: s.kind,
            projectedAt: t(proj.steps[s.id].start),
            waitingFor: s.deps.filter((d) => snap.state.steps[d].status !== 'done'),
            approvers: s.kind === 'gate' ? p.approvers.map((a) => person(a)) : undefined,
          })),
        decisions: p.steps
          .filter((s) => snap.state.steps[s.id].decision)
          .map((s) => ({ id: s.id, decision: snap.state.steps[s.id].decision, by: person(snap.state.steps[s.id].decisionBy), note: snap.state.steps[s.id].decisionNote })),
        projectionAssumptions: proj.assumptions,
        recentEvents: snap.recent.slice(-12).map((e) => ({ at: t(e.at), planTime: t(e.planTime), type: e.type, step: e.stepId, by: person(e.actor.accountId), text: e.text, decision: e.decision })),
      };
    },

    /**
     * On-platform diagnostics: exercises the real store with concurrent writers on a scratch plan, then deletes it.
     * Lets a deployment prove the concurrency primitive instead of assuming it.
     */
    async selfTest(ctx: Ctx) {
      const started = clock();
      const p = buildDemoPlan(`selftest${newId()}`, started, ctx.actor.accountId);
      await store.putPlan(p);
      const roles = rolesFor(p, ctx.actor.accountId, false);
      const noJira: Ctx = { actor: ctx.actor, source: ctx.source };
      const checks: { name: string; pass: boolean; detail: string }[] = [];
      const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });
      try {
        // 1. Raw primitive: two writers race for the same event slot.
        const probe = (text: string): ExecEvent => ({ seq: 1, type: 'PLAN_STARTED', at: clock(), planTime: clock(), simulated: false, actor: ctx.actor, source: ctx.source, text });
        const race = await Promise.all([store.appendEvent(p.id, probe('a')), store.appendEvent(p.id, probe('b'))]);
        add('create-if-absent: exactly one of two racing writers wins', race.filter(Boolean).length === 1, `results ${JSON.stringify(race)}`);
        const again = await store.appendEvent(p.id, probe('c'));
        add('create-if-absent: a later write to an existing slot is refused', again === false, `result ${again}`);
        // 2. Three operators start the same step at once.
        const starts = await Promise.allSettled([1, 2, 3].map(() => commit(p, { type: 'startStep', stepId: 'FRZ-1' }, noJira, roles)));
        const won = starts.filter((r) => r.status === 'fulfilled').length;
        const reasons = starts.filter((r) => r.status === 'rejected').map((r) => ((r as PromiseRejectedResult).reason as DomainError)?.code ?? 'ERR');
        add('three concurrent starts of one step: exactly one succeeds', won === 1 && reasons.every((c) => c === 'INVALID_STATE'), `succeeded ${won}, rejected with ${reasons.join(',')}`);
        // 3. Five independent commands at once must all land without gaps.
        const notes = await Promise.allSettled([1, 2, 3, 4, 5].map((i) => commit(p, { type: 'addNote', text: `self-test note ${i}` }, noJira, roles)));
        const landed = notes.filter((r) => r.status === 'fulfilled').length;
        const snap = await load(p);
        const seqs: number[] = [];
        for (let i = 1; i <= snap.seq; i++) if (await store.getEvent(p.id, i)) seqs.push(i);
        add('five concurrent notes: all recorded, sequence gapless', landed === 5 && snap.seq === 7 && seqs.length === 7, `landed ${landed}, head ${snap.seq}, events present ${seqs.length}`);
        // 4. Recovery: state rebuilt from the log equals the snapshot state.
        const rebuilt = seqs.length ? await (async () => { let s = initialState(p); for (const i of seqs) s = apply(p, s, (await store.getEvent(p.id, i))!); return s; })() : initialState(p);
        add('state rebuilt from the event log equals the stored snapshot', canonical(rebuilt) === canonical(snap.state), `FRZ-1 is ${rebuilt.steps['FRZ-1'].status}`);
      } catch (err) {
        add('self-test completed without an unexpected error', false, (err as Error).message);
      } finally {
        const last = await store.getHead(p.id).catch(() => 0);
        await store.deletePlan(p.id, Math.max(last, 10));
      }
      return { passed: checks.every((c) => c.pass), durationMs: clock() - started, checks };
    },

    async stepImpact(planId: string, stepId: string, ctx?: Ctx) {
      const p = ctx ? await readable(ctx, planId) : await plan(planId);
      const snap = await load(p);
      const proj = computeProjection(p, snap.state, clock() + snap.state.clockOffsetMs);
      if (!proj.steps[stepId]) throw new DomainError('NOT_FOUND', `Step ${stepId} does not exist in this plan.`);
      const t = planTimeLabel(p);
      return impactOf(p, proj, stepId).map((i) => ({
        id: i.id,
        title: p.steps.find((s) => s.id === i.id)!.title,
        slipVsBaselineMin: i.slipMin,
        onCriticalPath: i.critical,
        projectedStart: t(i.projectedStart),
        projectedEnd: t(i.projectedEnd),
      }));
    },
  };
}

export type Service = ReturnType<typeof createService>;

/** True when the effect of a demo-script command is already present in the state. */
function alreadyDone(cmd: Command, state: ExecState): boolean {
  if (cmd.type === 'startPlan') return state.phase !== 'ready';
  if (cmd.type === 'startStep') return ['running', 'done'].includes(state.steps[cmd.stepId]?.status);
  if (cmd.type === 'completeStep') return state.steps[cmd.stepId]?.status === 'done';
  return false;
}

/** JSON with object keys sorted, so two equal values compare equal even if a store returns keys in another order. */
function canonical(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : val,
  );
}

function defaultId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
