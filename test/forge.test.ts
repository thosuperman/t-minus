// Tests for the Forge adapters with @forge/kvs and @forge/api replaced by in-memory fakes.
// They cover the adapter logic only; behaviour of the real Forge services is verified on a development site.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mem = new Map<string, unknown>();
vi.mock('@forge/kvs', () => ({
  kvs: {
    get: async (k: string) => (mem.has(k) ? JSON.parse(JSON.stringify(mem.get(k))) : undefined),
    set: async (k: string, v: unknown, opts?: { keyPolicy?: string }) => {
      if (opts?.keyPolicy === 'FAIL_IF_EXISTS' && mem.has(k)) throw new Error('KEY_ALREADY_EXISTS');
      mem.set(k, JSON.parse(JSON.stringify(v)));
    },
    delete: async (k: string) => void mem.delete(k),
  },
}));
vi.mock('@forge/api', () => ({ default: { asUser: () => ({ requestJira: async () => ({ ok: false, status: 500, text: async () => '', json: async () => ({}) }) }) }, route: (s: TemplateStringsArray) => s.join(''), assumeTrustedRoute: (s: string) => s }));
vi.mock('@forge/resolver', () => ({ default: class { define() {} getDefinitions() { return () => undefined; } } }));

import { addOperationalNote, getSituation, getStepImpact } from '../src/index';
import { createService } from '../src/core/service';
import { KvsStore } from '../src/forge/kvsStore';
import { ExecEvent } from '../src/core/types';

const lead = { actor: { accountId: 'lead' }, source: 'ui' as const };

beforeEach(() => mem.clear());

describe('KvsStore', () => {
  it('appendEvent creates a slot once and reports a lost race as false', async () => {
    const store = new KvsStore();
    const e = { seq: 1, type: 'NOTE_ADDED', at: 1, planTime: 1, simulated: false, actor: { accountId: 'a' }, source: 'ui', text: 'first' } as ExecEvent;
    expect(await store.appendEvent('p', e)).toBe(true);
    expect(await store.appendEvent('p', { ...e, text: 'second' })).toBe(false);
    expect((await store.getEvent('p', 1))!.text).toBe('first');
    expect(await store.getEvent('p', 2)).toBeUndefined();
  });
  it('runs the full service on top of KVS, including concurrent writers', async () => {
    const svc = createService(new KvsStore());
    const v = await svc.createDemoPlan(lead);
    await svc.execute(lead, v.plan.id, { type: 'startPlan' });
    const results = await Promise.allSettled([1, 2, 3].map(() => svc.execute(lead, v.plan.id, { type: 'startStep', stepId: 'FRZ-1' })));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await svc.audit(v.plan.id)).map((e) => e.type)).toEqual(['PLAN_STARTED', 'STEP_STARTED']);
    await svc.deletePlan(lead, v.plan.id);
    expect([...mem.keys()]).toEqual(['plans']);
  });
});

describe('Rovo actions', () => {
  it('get-situation says so when no plan exists', async () => {
    expect(await getSituation({})).toMatchObject({ found: false });
  });
  it('get-situation returns live state from storage; get-step-impact tolerates lower-case ids and rejects unknown ones', async () => {
    const svc = createService(new KvsStore());
    const v = await svc.createDemoPlan(lead);
    await svc.runDemoScript(lead, v.plan.id);
    const sit = (await getSituation({ planId: '  ' })) as any;
    expect(sit.found).toBe(true);
    expect(sit.inProgress[0]).toMatchObject({ id: 'MIG-3', overrunMin: 45, endIsRecordedFact: false, projectionBasis: 'overrun-floor' });
    expect(sit.rollback.note).toMatch(/never starts a rollback/);
    const impact = (await getStepImpact({ stepId: 'mig-3' })) as any;
    expect(impact.downstream).toHaveLength(9);
    expect(await getStepImpact({ stepId: 'NOPE' })).toMatchObject({ error: 'NOT_FOUND' });
    expect(await getStepImpact({})).toMatchObject({ error: 'INVALID_INPUT' });
  });
  it('add-operational-note takes identity from context, never from inputs, and refuses unknown users', async () => {
    const svc = createService(new KvsStore());
    const v = await svc.createDemoPlan(lead);
    await svc.execute(lead, v.plan.id, { type: 'startPlan' });
    expect(await addOperationalNote({ text: 'hi' }, {})).toMatchObject({ error: 'FORBIDDEN' });
    expect(await addOperationalNote({ text: 'hi', accountId: 'lead' } as any, { accountId: 'stranger' })).toMatchObject({ error: 'FORBIDDEN' });
    expect(await addOperationalNote({ text: '   ' }, { accountId: 'lead' })).toMatchObject({ error: 'INVALID_INPUT' });
    const ok = (await addOperationalNote({ text: 'Bridge call moved to line 2', stepId: 'frz-1' }, { accountId: 'lead' })) as any;
    expect(ok).toMatchObject({ recorded: true, step: 'FRZ-1', text: 'Bridge call moved to line 2' });
    const audit = await svc.audit(v.plan.id);
    expect(audit.at(-1)).toMatchObject({ type: 'NOTE_ADDED', source: 'rovo', actor: { accountId: 'lead' } });
    expect(JSON.stringify(audit.at(-1))).not.toContain('displayName');
    expect(audit).toHaveLength(2);
  });
});
