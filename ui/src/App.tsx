import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { computeProjection } from '../../src/core/engine';
import type { View } from '../../src/core/service';
import type { PlanSummary } from '../../src/core/store';
import type { Command } from '../../src/core/types';
import { ApiError, call, devUser, hostContext, HostContext } from './api';
import { Board } from './Board';
import { Home } from './Home';

const POLL_MS = 4000;

export interface Toast {
  id: number;
  kind: 'error' | 'warn' | 'info';
  text: string;
}

export function App() {
  const [host, setHost] = useState<HostContext>({});
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [tick, setTick] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const toastId = useRef(0);

  const toast = useCallback((kind: Toast['kind'], text: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 9000 : 6000);
  }, []);

  const accept = useCallback(
    (v: View) => {
      setView(v);
      setFetchedAt(Date.now());
      setStale(false);
      v.warnings.forEach((w) => toast('warn', w));
    },
    [toast],
  );

  const refreshPlans = useCallback(async () => {
    try {
      setPlans(await call<PlanSummary[]>('listPlans'));
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    hostContext().then(setHost);
    refreshPlans();
  }, [refreshPlans]);

  // Development harness only (removed from the production bundle): ?demo=overrun prepares the demo state for screenshots.
  useEffect(() => {
    if (!import.meta.env.DEV || new URLSearchParams(location.search).get('demo') !== 'overrun') return;
    (async () => {
      const v0 = await call<View>('createDemo', { projectKey: 'CUT', createIssues: true });
      let cursor: number | null = 0;
      while (cursor !== null) cursor = (await call<{ view: View; next: number | null }>('runDemoScript', { planId: v0.plan.id, cursor })).next;
      const v = await call<View>('execute', { planId: v0.plan.id, command: { type: 'advanceClock', minutes: 30 } });
      setPlanId(v.plan.id);
      setView(v);
      setFetchedAt(Date.now());
    })();
  }, []);

  const open = useCallback(
    async (id: string) => {
      setPlanId(id);
      setView(null);
      try {
        accept(await call<View>('getView', { planId: id }));
      } catch (e) {
        toast('error', (e as Error).message);
        setPlanId(null);
        refreshPlans();
      }
    },
    [accept, toast, refreshPlans],
  );

  // Polling baseline: ask only for the latest sequence number, fetch the full view when it moved.
  useEffect(() => {
    if (!planId || !view) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      if (document.hidden) return;
      try {
        const head = await call<{ seq: number; exists: boolean }>('poll', { planId });
        if (cancelled) return;
        if (!head.exists) {
          toast('warn', 'This plan was reset or deleted by another user.');
          setPlanId(null);
          setView(null);
          refreshPlans();
          return;
        }
        if (head.seq !== view.seq) accept(await call<View>('getView', { planId }));
        else setStale(false);
      } catch {
        if (!cancelled) setStale(true);
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [planId, view, accept, toast, refreshPlans]);

  // Local clock: re-render every second so countdowns move between server reads.
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const planNow = view ? view.planNow + (Date.now() - fetchedAt) : 0;
  // Recompute the projection locally with the same engine the server uses. Bucketed to 5 s to keep it cheap.
  const bucket = Math.floor(planNow / 5000);
  const projection = useMemo(
    () => (view ? computeProjection(view.plan, view.state, planNow) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, bucket],
  );
  void tick;

  const act = useCallback(
    async (command: Command): Promise<boolean> => {
      if (!planId) return false;
      setBusy(true);
      try {
        accept(await call<View>('execute', { planId, command }));
        return true;
      } catch (e) {
        const err = e as ApiError;
        toast('error', err.message);
        // Deterministic recovery for a stale client: always reload the authoritative state after a rejection.
        try {
          accept(await call<View>('getView', { planId }));
        } catch {
          /* handled by polling */
        }
        return false;
      } finally {
        setBusy(false);
      }
    },
    [planId, accept, toast],
  );

  const run = useCallback(
    async (fn: string, payload: Record<string, unknown>, onDone?: (v: View) => void) => {
      setBusy(true);
      try {
        const v = await call<View>(fn, payload);
        if (v && (v as View).plan) {
          setPlanId(v.plan.id);
          accept(v);
          onDone?.(v);
        }
        refreshPlans();
      } catch (e) {
        toast('error', (e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [accept, toast, refreshPlans],
  );

  // The scripted lead-up runs in short server calls so no single call approaches the platform time limit.
  const runScript = useCallback(async () => {
    if (!planId) return;
    setBusy(true);
    try {
      let cursor: number | null = 0;
      while (cursor !== null) {
        const r: { view: View; next: number | null } = await call('runDemoScript', { planId, cursor });
        accept(r.view);
        cursor = r.next;
      }
    } catch (e) {
      toast('error', (e as Error).message);
      try {
        accept(await call<View>('getView', { planId }));
      } catch {
        /* handled by polling */
      }
    } finally {
      setBusy(false);
    }
  }, [planId, accept, toast]);

  const resetDemo = useCallback(async () => {
    if (!view) return;
    setBusy(true);
    try {
      const v = await call<View>('resetDemo', { planId: view.plan.id });
      setPlanId(v.plan.id);
      accept(v);
      refreshPlans();
      toast('info', 'Demo reset. The plan and its audit trail were replaced; linked Jira issues were moved back to their first status.');
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [view, accept, refreshPlans, toast]);

  return (
    <div className="app">
      {devUser && !new URLSearchParams(location.search).has('shot') && (
        <div className="devbar" role="note">
          Local development harness (in-memory store, fake Jira). Acting as <strong>{devUser}</strong>. Not the deployed Forge app.
        </div>
      )}
      {!planId && (
        <Home
          host={host}
          plans={plans}
          loadError={loadError}
          busy={busy}
          onOpen={open}
          onDelete={async (id) => {
            setBusy(true);
            try {
              await call('deletePlan', { planId: id });
              toast('info', 'Plan deleted.');
            } catch (e) {
              toast('error', (e as Error).message);
            } finally {
              setBusy(false);
              refreshPlans();
            }
          }}
          onCreateDemo={(createIssues) => run('createDemo', { projectKey: host.projectKey, createIssues })}
          onImport={(p) => run('importPlan', { projectKey: host.projectKey, ...p })}
          onRetry={refreshPlans}
        />
      )}
      {planId && !view && <div className="loading" role="status">Loading plan…</div>}
      {planId && view && projection && (
        <Board
          view={view}
          projection={projection}
          planNow={planNow}
          busy={busy}
          stale={stale}
          act={act}
          onBack={() => {
            setPlanId(null);
            setView(null);
            refreshPlans();
          }}
          onRunScript={runScript}
          onResetDemo={resetDemo}
        />
      )}
      <div className="toasts" aria-live="assertive">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            {t.text}
            <button className="toast-x" aria-label="Dismiss" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
