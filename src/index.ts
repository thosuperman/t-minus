// Forge entry points: UI resolver and Rovo agent actions.
import Resolver from '@forge/resolver';
import { dispatch } from './core/api';
import { createService, Ctx } from './core/service';
import { DomainError } from './core/types';
import { jiraPort, lookupNames } from './forge/jira';
import { KvsStore } from './forge/kvsStore';

const svc = createService(new KvsStore());

const resolver = new Resolver();

resolver.define('api', async (req) => {
  const { fn, payload } = (req.payload ?? {}) as { fn: string; payload?: Record<string, unknown> };
  // The acting user comes from the Forge context, never from the payload.
  const accountId = req.context.accountId as string | undefined;
  if (!accountId) return { ok: false, code: 'FORBIDDEN', message: 'You need to be logged in to use T-Minus.' };
  const ctx: Ctx = { actor: { accountId }, source: 'ui', jira: jiraPort };
  return dispatch(svc, ctx, fn, payload ?? {});
});

export const handler = resolver.getDefinitions();

// ---------- Rovo actions ----------
// Inputs are extracted by an LLM and may be wrong. They are treated as untrusted hints:
// identity comes from context, and every write goes through the same validation as the UI.

type ActionCtx = { accountId?: string; principal?: { accountId?: string } };
const actor = (context: ActionCtx) => context?.accountId ?? context?.principal?.accountId;

const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

async function safely<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof DomainError) return { error: e.code, message: e.message };
    console.error('[tminus] action failed', e);
    return { error: 'INTERNAL', message: 'The action failed. No change was made.' };
  }
}

export async function getSituation(payload: { planId?: string }) {
  // Names are looked up with the app's own read access for this answer only; nothing is stored.
  return safely(() => svc.situation(clean(payload?.planId), (ids) => lookupNames(ids, 'app')));
}

export async function getStepImpact(payload: { stepId?: string; planId?: string }) {
  return safely(async () => {
    const stepId = clean(payload?.stepId);
    if (!stepId) return { error: 'INVALID_INPUT', message: 'Which step? Give a step id such as MIG-3.' };
    const planId = clean(payload?.planId) ?? (await svc.listPlans())[0]?.id;
    if (!planId) return { error: 'NOT_FOUND', message: 'No cutover plan exists yet.' };
    return { stepId, downstream: await svc.stepImpact(planId, stepId.toUpperCase()) };
  });
}

export async function addOperationalNote(payload: { text?: string; stepId?: string; planId?: string }, context: ActionCtx) {
  return safely(async () => {
    const accountId = actor(context);
    if (!accountId) return { error: 'FORBIDDEN', message: 'The acting user could not be identified. No note was recorded.' };
    const text = clean(payload?.text);
    if (!text) return { error: 'INVALID_INPUT', message: 'The note is empty.' };
    const planId = clean(payload?.planId) ?? (await svc.listPlans())[0]?.id;
    if (!planId) return { error: 'NOT_FOUND', message: 'No cutover plan exists yet.' };
    // No Jira port here: only commanders and step owners (known to the app) may write through the agent.
    const view = await svc.execute({ actor: { accountId }, source: 'rovo' }, planId, {
      type: 'addNote',
      stepId: clean(payload?.stepId)?.toUpperCase(),
      text,
    });
    const e = view.recent.at(-1)!;
    return { recorded: true, sequence: e.seq, recordedAt: new Date(e.at).toISOString(), step: e.stepId ?? null, text: e.text };
  });
}
