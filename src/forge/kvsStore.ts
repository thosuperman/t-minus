// Forge KVS implementation of the Store port.
// Concurrency relies on one documented primitive: kvs.set(..., { keyPolicy: 'FAIL_IF_EXISTS' }).
import { kvs } from '@forge/kvs';
import { PlanSummary, Snapshot, Store } from '../core/store';
import { ExecEvent, PlanDef } from '../core/types';

const pad = (n: number) => String(n).padStart(6, '0');
const evtKey = (planId: string, seq: number) => `evt:${planId}:${pad(seq)}`;

export class KvsStore implements Store {
  async listPlans(): Promise<PlanSummary[]> {
    return ((await kvs.get('plans')) as PlanSummary[] | undefined) ?? [];
  }
  async savePlanList(list: PlanSummary[]): Promise<void> {
    await kvs.set('plans', list);
  }
  async getPlan(planId: string): Promise<PlanDef | undefined> {
    return (await kvs.get(`plan:${planId}`)) as PlanDef | undefined;
  }
  async putPlan(plan: PlanDef): Promise<void> {
    await kvs.set(`plan:${plan.id}`, plan);
  }
  async deletePlan(planId: string, lastSeq: number): Promise<void> {
    await Promise.all([kvs.delete(`plan:${planId}`), kvs.delete(`head:${planId}`), kvs.delete(`snap:${planId}`)]);
    for (let from = 1; from <= lastSeq; from += 20) {
      await Promise.all(Array.from({ length: Math.min(20, lastSeq - from + 1) }, (_, i) => kvs.delete(evtKey(planId, from + i))));
    }
  }
  async getHead(planId: string): Promise<number> {
    return ((await kvs.get(`head:${planId}`)) as number | undefined) ?? 0;
  }
  async setHead(planId: string, seq: number): Promise<void> {
    // Last write wins. A stale head is harmless: readers probe the log past it (see service.poll / load).
    await kvs.set(`head:${planId}`, seq);
  }
  async getSnapshot(planId: string): Promise<Snapshot | undefined> {
    return (await kvs.get(`snap:${planId}`)) as Snapshot | undefined;
  }
  async putSnapshot(planId: string, snap: Snapshot): Promise<void> {
    // Last write wins. A stale snapshot is only a slower starting point; state is always rebuilt from the log.
    await kvs.set(`snap:${planId}`, snap);
  }
  async getEvent(planId: string, seq: number): Promise<ExecEvent | undefined> {
    return (await kvs.get(evtKey(planId, seq))) as ExecEvent | undefined;
  }
  async appendEvent(planId: string, event: ExecEvent): Promise<boolean> {
    const key = evtKey(planId, event.seq);
    try {
      await kvs.set(key, event, { keyPolicy: 'FAIL_IF_EXISTS' });
      return true;
    } catch (err) {
      // The docs do not name the error raised when the key exists, so confirm by reading the slot.
      const existing = (await kvs.get(key)) as ExecEvent | undefined;
      if (existing) return false;
      throw err;
    }
  }
}
