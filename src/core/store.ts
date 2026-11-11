// Storage port. The Forge implementation uses KVS; tests and the local dev harness use MemoryStore.
import { ExecEvent, ExecState, PlanDef } from './types';

export interface PlanSummary {
  id: string;
  name: string;
  projectKey?: string;
  simulation: boolean;
  createdAt: number;
}

export interface Snapshot {
  seq: number;
  state: ExecState;
}

export interface Store {
  listPlans(): Promise<PlanSummary[]>;
  savePlanList(list: PlanSummary[]): Promise<void>;
  getPlan(planId: string): Promise<PlanDef | undefined>;
  putPlan(plan: PlanDef): Promise<void>;
  deletePlan(planId: string, lastSeq: number): Promise<void>;
  /** Cheap pointer used by polling clients. May lag behind the log; never ahead of it. */
  getHead(planId: string): Promise<number>;
  setHead(planId: string, seq: number): Promise<void>;
  getSnapshot(planId: string): Promise<Snapshot | undefined>;
  putSnapshot(planId: string, snap: Snapshot): Promise<void>;
  getEvent(planId: string, seq: number): Promise<ExecEvent | undefined>;
  /**
   * Create event `seq` only if it does not exist yet. Returns false when another writer got there first.
   * This create-if-absent is the single concurrency primitive the whole app relies on.
   */
  appendEvent(planId: string, event: ExecEvent): Promise<boolean>;
}

/** In-memory store with optional random latency, so tests can interleave concurrent writers. */
export class MemoryStore implements Store {
  private data = new Map<string, unknown>();
  constructor(private jitterMs = 0) {}
  private async lag() {
    if (this.jitterMs > 0) await new Promise((r) => setTimeout(r, Math.random() * this.jitterMs));
  }
  private clone<T>(v: T): T {
    return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
  }
  async listPlans() {
    await this.lag();
    return this.clone((this.data.get('plans') as PlanSummary[]) ?? []);
  }
  async savePlanList(list: PlanSummary[]) {
    await this.lag();
    this.data.set('plans', this.clone(list));
  }
  async getPlan(id: string) {
    await this.lag();
    return this.clone(this.data.get(`plan:${id}`) as PlanDef | undefined);
  }
  async putPlan(plan: PlanDef) {
    await this.lag();
    this.data.set(`plan:${plan.id}`, this.clone(plan));
  }
  async deletePlan(id: string, lastSeq: number) {
    this.data.delete(`plan:${id}`);
    this.data.delete(`head:${id}`);
    this.data.delete(`snap:${id}`);
    for (let i = 1; i <= lastSeq; i++) this.data.delete(`evt:${id}:${i}`);
  }
  async getHead(id: string) {
    await this.lag();
    return (this.data.get(`head:${id}`) as number) ?? 0;
  }
  async setHead(id: string, seq: number) {
    await this.lag();
    const cur = (this.data.get(`head:${id}`) as number) ?? 0;
    if (seq > cur) this.data.set(`head:${id}`, seq);
  }
  async getSnapshot(id: string) {
    await this.lag();
    return this.clone(this.data.get(`snap:${id}`) as Snapshot | undefined);
  }
  async putSnapshot(id: string, snap: Snapshot) {
    await this.lag();
    const cur = this.data.get(`snap:${id}`) as Snapshot | undefined;
    if (!cur || snap.seq > cur.seq) this.data.set(`snap:${id}`, this.clone(snap));
  }
  async getEvent(id: string, seq: number) {
    await this.lag();
    return this.clone(this.data.get(`evt:${id}:${seq}`) as ExecEvent | undefined);
  }
  async appendEvent(id: string, event: ExecEvent) {
    await this.lag();
    const key = `evt:${id}:${event.seq}`;
    if (this.data.has(key)) return false; // check-and-set happens without an await in between: atomic here
    this.data.set(key, this.clone(event));
    return true;
  }
}
