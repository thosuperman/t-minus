// One dispatch table shared by the Forge resolver and the local dev server, so both run the same code path.
import { Ctx, Service } from './service';
import { Command, DomainError } from './types';

export type ApiResult<T = unknown> = { ok: true; data: T } | { ok: false; code: string; message: string };

type P = Record<string, any>;

const handlers: Record<string, (svc: Service, ctx: Ctx, p: P) => Promise<unknown>> = {
  listPlans: (svc, ctx) => svc.listPlans(ctx),
  getView: (svc, ctx, p) => svc.getView(ctx, str(p.planId, 'planId')),
  poll: (svc, _ctx, p) => svc.poll(str(p.planId, 'planId')),
  execute: (svc, ctx, p) => svc.execute(ctx, str(p.planId, 'planId'), p.command as Command),
  createDemo: (svc, ctx, p) => svc.createDemoPlan(ctx, { projectKey: p.projectKey, createIssues: !!p.createIssues }),
  importPlan: (svc, ctx, p) => {
    const windowEndMin = num(p.windowEndMin, 'windowEndMin', 10, 7 * 24 * 60, 'The cutover window must be between 10 minutes and 7 days.');
    const rollbackDurationMin = num(p.rollbackDurationMin, 'rollbackDurationMin', 0, 7 * 24 * 60, 'Enter how long a rollback takes, up to 7 days.');
    if (rollbackDurationMin >= windowEndMin) throw new DomainError('INVALID_INPUT', 'A rollback must take less time than the whole cutover window.');
    return svc.importPlan(ctx, {
      projectKey: str(p.projectKey, 'projectKey'),
      jql: p.jql || undefined,
      name: String(p.name ?? ''),
      windowEndMin,
      rollbackDurationMin,
      simulation: !!p.simulation,
    });
  },
  deletePlan: (svc, ctx, p) => svc.deletePlan(ctx, str(p.planId, 'planId')).then(() => ({ deleted: true })),
  runDemoScript: (svc, ctx, p) => svc.runDemoScriptChunk(ctx, str(p.planId, 'planId'), Number(p.cursor ?? 0)),
  audit: (svc, ctx, p) => svc.audit(str(p.planId, 'planId'), ctx),
  selfTest: (svc, ctx) => svc.selfTest(ctx),
  resetDemo: (svc, ctx, p) => svc.resetDemoPlan(ctx, str(p.planId, 'planId')),
};

function str(v: unknown, name: string): string {
  if (typeof v !== 'string' || !v) throw new DomainError('INVALID_INPUT', `${name} is required.`);
  return v;
}
function num(v: unknown, name: string, min: number, max: number, message?: string): number {
  const n = v === '' || v === null || v === undefined ? NaN : Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new DomainError('INVALID_INPUT', message ?? `${name} must be between ${min} and ${max}.`);
  return n;
}

export async function dispatch(svc: Service, ctx: Ctx, fn: string, payload: P = {}): Promise<ApiResult> {
  const h = handlers[fn];
  if (!h) return { ok: false, code: 'NOT_FOUND', message: `Unknown function ${fn}.` };
  try {
    return { ok: true, data: await h(svc, ctx, payload) };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, code: e.code, message: e.message };
    console.error(`[tminus] ${fn} failed`, e);
    return { ok: false, code: 'INTERNAL', message: (e as Error)?.message ?? 'Unexpected error.' };
  }
}
