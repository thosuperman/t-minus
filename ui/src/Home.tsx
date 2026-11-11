import { useState } from 'react';
import type { PlanSummary } from '../../src/core/store';
import { call } from './api';
import { ConfirmButton } from './ConfirmButton';
import type { HostContext } from './api';

interface SelfTest {
  passed: boolean;
  durationMs: number;
  checks: { name: string; pass: boolean; detail: string }[];
}

interface Props {
  host: HostContext;
  plans: PlanSummary[] | null;
  loadError: string | null;
  busy: boolean;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onCreateDemo: (createIssues: boolean) => void;
  onImport: (p: { name: string; windowEndMin: number; rollbackDurationMin: number; simulation: boolean }) => void;
  onRetry: () => void;
}

export function Home({ host, plans: allPlans, loadError, busy, onOpen, onDelete, onCreateDemo, onImport, onRetry }: Props) {
  // Show the plans of the project this page was opened from.
  const plans = allPlans && host.projectKey ? allPlans.filter((p) => !p.projectKey || p.projectKey === host.projectKey) : allPlans;
  const [createIssues, setCreateIssues] = useState(true);
  const [name, setName] = useState('');
  const [windowH, setWindowH] = useState('8');
  const [rollbackMin, setRollbackMin] = useState('90');
  const [sim, setSim] = useState(false);
  const [diag, setDiag] = useState<SelfTest | null>(null);
  const [diagBusy, setDiagBusy] = useState(false);
  const [diagError, setDiagError] = useState<string | null>(null);
  const runDiag = async () => {
    setDiagBusy(true);
    setDiagError(null);
    try {
      setDiag(await call<SelfTest>('selfTest'));
    } catch (e) {
      setDiagError((e as Error).message);
    } finally {
      setDiagBusy(false);
    }
  };

  return (
    <main className="home">
      <header className="home-head">
        <h1>T-Minus</h1>
        <p className="lede">Go-live mission control. Run the cutover minute by minute, see what a delay does downstream, and know how long you still have to decide on a rollback.</p>
      </header>

      {loadError && (
        <div className="banner banner-error" role="alert">
          Could not load plans: {loadError} <button className="btn" onClick={onRetry}>Retry</button>
        </div>
      )}

      <section className="card">
        <h2>Cutover plans{host.projectKey ? ` in ${host.projectKey}` : ''}</h2>
        {plans === null && !loadError && <p className="muted" role="status">Loading…</p>}
        {plans?.length === 0 && <p className="muted">No plans yet. Load the demo scenario below, or import the issues of this Jira project as a runbook.</p>}
        {!!plans?.length && (
          <ul className="planlist">
            {plans.map((p) => (
              <li key={p.id}>
                <button className="planlink" onClick={() => onOpen(p.id)}>
                  <span className="planname">{p.name}</span>
                  <span className="muted">
                    {p.projectKey ? `${p.projectKey} · ` : ''}
                    {p.simulation ? 'simulation · ' : ''}created {new Date(p.createdAt).toLocaleString()}
                  </span>
                </button>
<ConfirmButton label="Delete" confirmLabel="Delete plan and audit trail" disabled={busy} onConfirm={() => onDelete(p.id)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="home-grid">
        <section className="card">
          <h2>Load the demo scenario</h2>
          <p>
            A synthetic ERP finance cutover: 17 steps across freeze, data migration, reconciliation, interfaces and go-live, with a bank payment file cutoff,
            two go/no-go checkpoints and a point of no return. All data is invented.
          </p>
          <label className="check">
            <input type="checkbox" checked={createIssues} disabled={!host.projectKey} onChange={(e) => setCreateIssues(e.target.checked)} />
            Also create one Jira issue per step in {host.projectKey ?? 'this project'} and link dependencies
          </label>
          <p className="muted small">The demo plan uses a simulated clock that you advance yourself. Simulated time is labelled everywhere; audit entries always keep the real server time.</p>
          <button className="btn btn-primary" disabled={busy} onClick={() => onCreateDemo(createIssues && !!host.projectKey)}>
            {busy ? 'Creating…' : 'Create demo plan'}
          </button>
        </section>

        <section className="card">
          <h2>Import this Jira project as a runbook</h2>
          <p>
            Every issue becomes a step. Links of type “Blocks” become dependencies, the original estimate becomes the planned duration (30 min if empty),
            the assignee becomes the owner. Label an issue <code>tminus-gate</code> for a go/no-go checkpoint or <code>tminus-pnr</code> for the point of no return.
          </p>
          <div className="form">
            <label>
              Plan name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Cutover ${host.projectKey ?? ''}`} />
            </label>
            <label>
              Cutover window (hours)
              <input inputMode="decimal" value={windowH} onChange={(e) => setWindowH(e.target.value)} />
            </label>
            <label>
              Rollback duration (minutes)
              <input inputMode="numeric" value={rollbackMin} onChange={(e) => setRollbackMin(e.target.value)} />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={sim} onChange={(e) => setSim(e.target.checked)} />
            Rehearsal mode (simulated clock)
          </label>
          <button
            className="btn"
            disabled={busy || !host.projectKey}
            onClick={() => onImport({ name, windowEndMin: Math.round(Number(windowH) * 60), rollbackDurationMin: Number(rollbackMin), simulation: sim })}
          >
            Import from {host.projectKey ?? 'project'}
          </button>
        </section>
      </div>

      <section className="card">
        <h2>Storage self-test</h2>
        <p className="muted small">
          Runs concurrent writers against this installation's storage on a scratch plan, then deletes it. Use it after installing to confirm that
          simultaneous actions by several operators cannot conflict.
        </p>
        <button className="btn" disabled={diagBusy} onClick={runDiag}>
          {diagBusy ? 'Running…' : 'Run self-test'}
        </button>
        {diagError && <p className="bad">Self-test could not run: {diagError}</p>}
        {diag && (
          <div className="diag" role="status">
            <p className={diag.passed ? 'diag-pass' : 'bad'}>
              <strong>{diag.passed ? 'All checks passed' : 'A check failed'}</strong> in {(diag.durationMs / 1000).toFixed(1)} s
            </p>
            <ul>
              {diag.checks.map((c) => (
                <li key={c.name} className={c.pass ? '' : 'bad'}>
                  {c.pass ? 'PASS' : 'FAIL'} · {c.name} <span className="muted">({c.detail})</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
