import { useEffect, useMemo, useRef, useState } from 'react';
import { impactOf } from '../../src/core/engine';
import type { View } from '../../src/core/service';
import type { Command, ExecEvent, GateDecision, Projection, StepDef, StepSchedule, StepState } from '../../src/core/types';
import { ConfirmButton } from './ConfirmButton';
import { clock, clockSec, dur, signed, tPlus } from './format';

const MIN = 60_000;

interface Props {
  view: View;
  projection: Projection;
  planNow: number;
  busy: boolean;
  stale: boolean;
  act: (c: Command) => Promise<boolean>;
  onBack: () => void;
  onRunScript: () => void;
  onResetDemo: () => void;
}

type Tone = 'ok' | 'info' | 'warn' | 'bad' | 'idle';

function stepTone(x: StepState, s: StepSchedule): { tone: Tone; label: string } {
  if (x.status === 'done') return { tone: 'ok', label: x.decision ? decisionLabel(x.decision) : 'Done' };
  if (x.status === 'blocked') return { tone: 'bad', label: 'Blocked' };
  if (x.decision === 'NO_GO') return { tone: 'bad', label: 'No-go' };
  if (x.status === 'running') return s.overrunMin > 0 ? { tone: 'warn', label: `Over by ${dur(s.overrunMin)}` } : { tone: 'info', label: 'Running' };
  if (s.ready) return { tone: 'info', label: 'Ready' };
  return { tone: 'idle', label: 'Waiting' };
}

const decisionLabel = (d: GateDecision) => (d === 'GO' ? 'Go' : d === 'CONDITIONAL_GO' ? 'Conditional go' : 'No-go');

export function Board({ view, projection: proj, planNow, busy, stale, act, onBack, onRunScript, onResetDemo }: Props) {
  const { plan, state, roles } = view;
  const who = (id?: string) => (id ? view.names[id] ?? 'Unknown user' : 'Unassigned');
  const [selected, setSelectedRaw] = useState<string | null>(null);
  const sideRef = useRef<HTMLElement>(null);
  const [revealTick, setRevealTick] = useState(0);
  const setSelected = (id: string | null) => {
    setSelectedRaw(id);
    if (id) setRevealTick((n) => n + 1);
  };
  // In the single-column layout the step panel sits below the runbook, so bring it into view when a step is opened.
  useEffect(() => {
    if (revealTick && sideRef.current && window.innerWidth <= 1180) sideRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [revealTick]);
  const byId = useMemo(() => new Map(plan.steps.map((s) => [s.id, s])), [plan]);
  const windowEnd = plan.plannedStart + plan.windowEndMin * MIN;

  const groups = useMemo(() => {
    const m = new Map<string, StepDef[]>();
    for (const id of proj.order) {
      const s = byId.get(id)!;
      if (!m.has(s.workstream)) m.set(s.workstream, []);
      m.get(s.workstream)!.push(s);
    }
    return [...m.entries()];
  }, [proj.order, byId]);

  // Timeline scale.
  const t0 = Math.min(plan.plannedStart, state.actualStart ?? plan.plannedStart);
  const t1 = Math.max(windowEnd, proj.projectedFinish, proj.baselineFinish) + 20 * MIN;
  const pct = (t: number) => `${Math.max(0, Math.min(100, ((t - t0) / (t1 - t0)) * 100))}%`;
  const ticks = useMemo(() => {
    const out: number[] = [];
    // Whole hours, at most about nine labels, so a plan that runs long never crowds the axis.
    const step = Math.max(1, Math.ceil((t1 - t0) / (9 * 60 * MIN))) * 60 * MIN;
    for (let t = plan.plannedStart; t < t1; t += step) out.push(t);
    return out;
  }, [t0, t1, plan.plannedStart]);

  const sel = selected ? byId.get(selected) : undefined;
  const breaches = proj.constraints.filter((c) => c.breached);
  const rb = proj.rollback;
  const phaseTone: Tone = state.phase === 'halted' ? 'bad' : state.phase === 'complete' ? 'ok' : state.phase === 'live' ? 'info' : 'idle';
  const overall: { tone: Tone; text: string } =
    state.phase === 'halted'
      ? { tone: 'bad', text: 'Halted: no-go recorded' }
      : state.phase === 'complete'
        ? { tone: 'ok', text: 'Cutover complete' }
        : state.phase === 'ready'
          ? { tone: 'idle', text: 'Not started' }
          : breaches.length
            ? { tone: 'bad', text: 'Projected to miss a deadline' }
            : proj.counts.blocked
              ? { tone: 'bad', text: 'Step blocked' }
              : proj.slipMin > 0
                ? { tone: 'warn', text: `Slipping ${dur(proj.slipMin)}` }
                : { tone: 'ok', text: 'On plan' };

  return (
    <main className="board">
      <header className="topbar">
        <button className="btn btn-ghost" onClick={onBack} aria-label="Back to plans">
          ← Plans
        </button>
        <div className="title">
          <h1>{plan.name}</h1>
          <div className="chips">
            <span className={`chip tone-${phaseTone}`}>{state.phase === 'ready' ? 'Ready' : state.phase === 'live' ? 'Live' : state.phase === 'halted' ? 'Halted' : 'Complete'}</span>
            <span className={`chip tone-${overall.tone}`}>{overall.text}</span>
            {proj.counts.blocked > 0 && overall.text !== 'Step blocked' && <span className="chip tone-bad">Step blocked</span>}
            {plan.simulation && <span className="chip chip-sim">Simulated clock</span>}
            {stale && <span className="chip tone-warn">Connection problem: showing last known state</span>}
          </div>
        </div>
        <div className="clockbox" aria-label="Plan time">
          <span className="clock">{clockSec(planNow)}</span>
          <span className="muted small">
            {tPlus(planNow, plan.plannedStart)} · plan time{state.clockOffsetMs ? ' (simulated)' : ''}
          </span>
        </div>
      </header>

      {plan.simulation && (
        <div className="simbar" role="group" aria-label="Demo controls">
          <span className="simlabel">Demo controls</span>
          {(state.phase === 'ready' || state.phase === 'live') && state.steps['MIG-3']?.status === 'pending' && roles.commander && (
            <button className="btn" disabled={busy} onClick={onRunScript} title="Runs real commands through the normal validation path, advancing the simulated clock, up to the migration overrun">
              Run scripted lead-up
            </button>
          )}
          {roles.commander &&
            [5, 15, 30].map((m) => (
              <button key={m} className="btn" disabled={busy} onClick={() => act({ type: 'advanceClock', minutes: m })}>
                Advance clock +{m} min
              </button>
            ))}
          {roles.commander && (
            <ConfirmButton label="Reset demo" confirmLabel="Delete this plan and start fresh" disabled={busy} onConfirm={onResetDemo} />
          )}
          <span className="muted small">Simulated time only moves the plan clock. Every audit entry keeps its real server timestamp.</span>
        </div>
      )}

      {state.phase === 'ready' && (
        <div className="banner">
          The plan has not started. Planned start {clock(plan.plannedStart)}.
          {roles.commander ? (
            <button className="btn btn-primary" disabled={busy} onClick={() => act({ type: 'startPlan' })}>
              Start cutover
            </button>
          ) : (
            <span className="muted"> A cutover commander starts the plan.</span>
          )}
        </div>
      )}
      {state.phase === 'halted' && (
        <div className="banner banner-error" role="alert">
          {state.haltedReason} Execution is stopped. T-Minus does not start a rollback: follow your rollback procedure and record what you do as notes.
        </div>
      )}

      <section className="kpis" aria-label="Situation">
        <div className="kpi">
          <div className="kpi-label">Progress</div>
          <div className="kpi-value">
            {proj.counts.done}
            <span className="kpi-of"> / {proj.counts.total} steps</span>
          </div>
          <div className="kpi-sub">
            {proj.counts.running} running · {proj.counts.blocked} blocked · {proj.counts.overrunning} over plan
          </div>
        </div>

        <div className={`kpi tone-border-${proj.slipMin > 0 ? 'warn' : 'ok'}`}>
          <div className="kpi-label">Projected finish <span className="tag tag-proj">projection</span></div>
          <div className="kpi-value">{clock(proj.projectedFinish)}</div>
          <div className="kpi-sub">
            {signed(proj.slipMin)} vs baseline {clock(proj.baselineFinish)}
            {proj.assumptions.length > 0 && <span className="muted"> · earliest possible, see assumptions</span>}
          </div>
        </div>

        <div className={`kpi tone-border-${breaches.length ? 'bad' : 'ok'}`}>
          <div className="kpi-label">Deadlines</div>
          <ul className="constraints">
            {proj.constraints.map((c) => (
              <li key={c.id} className={c.breached ? 'bad' : c.marginMin <= 15 ? 'warn' : ''}>
                <span>{c.label}</span>
                <span className="num">
                  {clock(c.deadline)} · {c.breached ? `missed by ${dur(-c.marginMin)}` : `${dur(c.marginMin)} margin`}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className={`kpi kpi-rollback rb-${rb.level}`} role="status" aria-live="polite">
          <div className="kpi-label">Rollback decision window</div>
          {rb.level === 'closed' ? (
            <>
              <div className="kpi-value">Closed</div>
              <div className="kpi-sub">{rb.closedReason === 'pnr-passed' ? 'The point of no return has been passed.' : `A ${dur(plan.rollbackDurationMin)} rollback can no longer finish inside the window.`}</div>
            </>
          ) : (
            <>
              <div className="kpi-value">
                {dur(rb.remainingMin)} <span className="kpi-of">left</span>
              </div>
              <div className="kpi-sub">
                Decide by {clock(rb.decisionDeadline)}.{' '}
                {rb.pnrAwaitingConfirmation
                  ? `Rollback stays possible until ${rb.pnrStepId} is confirmed, and no later than the ${dur(plan.rollbackDurationMin)} it needs before ${clock(windowEnd)}.`
                  : rb.pnrStart !== undefined && rb.decisionDeadline === rb.pnrStart
                  ? `Limited by the projected start of ${rb.pnrStepId}.`
                  : `Limited by the ${dur(plan.rollbackDurationMin)} a rollback needs before ${clock(windowEnd)}.`}
              </div>
            </>
          )}
        </div>
      </section>

      {proj.awaitingDecision.length > 0 && (
        <div className="banner banner-decision" role="status">
          Decision needed:{' '}
          {proj.awaitingDecision.map((id) => (
            <button key={id} className="btn btn-primary" onClick={() => setSelected(id)}>
              {id} · {byId.get(id)!.title}
            </button>
          ))}
        </div>
      )}

      <div className="columns">
        <section className="runbook" aria-label="Runbook">
          <div className="rb-head">
            <div className="rb-left">Step</div>
            <div className="rb-time" aria-hidden="true">
              {ticks.map((t) => (
                <span key={t} className="tick" style={{ left: pct(t) }}>
                  {clock(t)}
                </span>
              ))}
            </div>
          </div>
          <div className="rb-body">
            <div className="rb-lines" aria-hidden="true">
              <div className="lines-inner">
                {state.phase !== 'ready' && <span className="vline vline-now" style={{ left: pct(planNow) }} title="Now" />}
                <span className="vline vline-window" style={{ left: pct(windowEnd) }} title={plan.windowLabel} />
                {rb.level !== 'closed' && <span className="vline vline-rollback" style={{ left: pct(rb.decisionDeadline) }} title="Rollback decision deadline" />}
              </div>
            </div>
            {groups.map(([ws, steps]) => (
              <div key={ws} className="group">
                <div className="group-name">{ws}</div>
                {steps.map((s) => {
                  const sc = proj.steps[s.id];
                  const x = state.steps[s.id];
                  const tone = stepTone(x, sc);
                  const plannedEnd = (x.actualStart ?? sc.start) + s.durationMin * MIN;
                  return (
                    <div key={s.id} className={`row ${selected === s.id ? 'row-sel' : ''} ${sc.critical && x.status !== 'done' ? 'row-crit' : ''}`}>
                      <div className="rb-left rowleft">
                      <button className="rowbtn" onClick={() => setSelected(s.id)} aria-pressed={selected === s.id}>
                        <span className={`dot tone-${tone.tone}`} aria-hidden="true" />
                        <span className="rowmain">
                          <span className="rowtitle">
                            <span className="sid">{s.id}</span> {s.title}
                          </span>
                          <span className="rowmeta">
                            <span className={`status tone-text-${tone.tone}`}>{tone.label}</span>
                            {s.kind === 'gate' && <span className="tag">Go/no-go</span>}
                            {s.kind === 'pnr' && <span className="tag tag-pnr">Point of no return</span>}
                            {sc.critical && x.status !== 'done' && <span className="tag tag-crit">Critical path</span>}
                            {x.escalated && <span className="tag tag-bad">Escalated</span>}
                            <span className="muted">
                              {x.status === 'done' ? `${clock(sc.start)}–${clock(sc.end)}` : `${sc.startIsActual ? '' : '~'}${clock(sc.start)}–~${clock(sc.end)}`}
                              {sc.slipMin > 0 && x.status !== 'done' ? ` · ${signed(sc.slipMin)}` : ''}
                              {s.ownerId ? ` · ${who(s.ownerId)}` : ''}
                            </span>
                          </span>
                        </span>
                      </button>
                      {state.phase === 'live' && (
                        <div className="quick">
                          {roles.operator && s.kind === 'task' && x.status === 'pending' && sc.ready && (
                            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => act({ type: 'startStep', stepId: s.id })} aria-label={`Start ${s.id}`}>
                              Start
                            </button>
                          )}
                          {roles.operator && s.kind !== 'gate' && x.status === 'running' && (
                            <button className="btn btn-sm" disabled={busy} onClick={() => act({ type: 'completeStep', stepId: s.id })} aria-label={`Complete ${s.id}`}>
                              Complete
                            </button>
                          )}
                          {s.kind !== 'task' && x.status === 'pending' && sc.ready && (
                            <button className="btn btn-primary btn-sm" onClick={() => setSelected(s.id)} aria-label={`Open decision for ${s.id}`}>
                              Decide
                            </button>
                          )}
                        </div>
                      )}
                      </div>
                      <div className="rb-time" aria-hidden="true">
                        <span className="bar-base" style={{ left: pct(sc.baselineStart), width: `calc(${pct(sc.baselineEnd)} - ${pct(sc.baselineStart)})` }} />
                        {sc.startIsActual && (
                          <span
                            className={`bar bar-actual tone-${x.status === 'done' ? 'ok' : x.status === 'blocked' ? 'bad' : 'info'}`}
                            style={{ left: pct(sc.start), width: `calc(${pct(x.status === 'done' ? sc.end : Math.min(planNow, sc.end))} - ${pct(sc.start)})` }}
                          />
                        )}
                        {x.status !== 'done' && sc.overrunMin > 0 && (
                          <span className="bar bar-over" style={{ left: pct(plannedEnd), width: `calc(${pct(planNow)} - ${pct(plannedEnd)})` }} />
                        )}
                        {x.status !== 'done' && (
                          <span
                            className={`bar bar-proj ${sc.critical ? 'bar-proj-crit' : ''}`}
                            style={{ left: pct(sc.startIsActual ? Math.min(planNow, sc.end) : sc.start), width: `calc(${pct(sc.end)} - ${pct(sc.startIsActual ? Math.min(planNow, sc.end) : sc.start)})` }}
                          />
                        )}
                        {s.mustFinishByMin !== undefined && <span className="deadline-mark" style={{ left: pct(plan.plannedStart + s.mustFinishByMin * MIN) }} title={s.constraintLabel} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="legend">
            <span><i className="lg lg-actual" /> recorded</span>
            <span><i className="lg lg-proj" /> projected</span>
            <span><i className="lg lg-over" /> over plan</span>
            <span><i className="lg lg-base" /> baseline</span>
            <span><i className="lg lg-now" /> now</span>
            <span><i className="lg lg-rollback" /> rollback decision deadline</span>
            <span><i className="lg lg-window" /> window end</span>
          </div>
          {proj.assumptions.length > 0 && (
            <div className="assumptions">
              <h3>What the projection assumes</h3>
              <ul>
                {proj.assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <aside className="side" ref={sideRef}>
          {sel ? (
            <StepPanel key={sel.id} plan={view} proj={proj} step={sel} planNow={planNow} busy={busy} act={act} onClose={() => setSelected(null)} onSelect={setSelected} />
          ) : (
            <div className="card hint">Select a step to see its timing, dependencies, downstream impact and actions.</div>
          )}
          <Feed events={view.recent} names={view.names} plannedStart={plan.plannedStart} canNote={roles.operator} busy={busy} act={act} />
        </aside>
      </div>
    </main>
  );
}

function StepPanel({
  plan: view,
  proj,
  step: s,
  planNow,
  busy,
  act,
  onClose,
  onSelect,
}: {
  plan: View;
  proj: Projection;
  step: StepDef;
  planNow: number;
  busy: boolean;
  act: (c: Command) => Promise<boolean>;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const { plan, state, roles } = view;
  const who = (id?: string) => (id ? view.names[id] ?? 'Unknown user' : 'Unassigned');
  const x = state.steps[s.id];
  const sc = proj.steps[s.id];
  const [text, setText] = useState('');
  const [remaining, setRemaining] = useState('');
  const impact = useMemo(() => impactOf(plan, proj, s.id), [plan, proj, s.id]);
  const live = state.phase === 'live';
  const tone = stepTone(x, sc);
  const title = (id: string) => plan.steps.find((p) => p.id === id)!.title;
  const needText = (fn: (t: string) => Command) => async () => {
    if (await act(fn(text))) setText('');
  };

  return (
    <div className="card panel">
      <div className="panel-head">
        <div>
          <div className="sid">{s.id}{s.issueKey && s.issueKey !== s.id ? ` · ${s.issueKey}` : ''}</div>
          <h2>{s.title}</h2>
        </div>
        <button className="btn btn-ghost" onClick={onClose} aria-label="Close step details">
          ×
        </button>
      </div>
      <div className="chips">
        <span className={`chip tone-${tone.tone}`}>{tone.label}</span>
        {sc.critical && x.status !== 'done' && <span className="chip chip-crit">Critical path</span>}
        {!sc.critical && x.status !== 'done' && <span className="chip">{dur(sc.floatMin)} float</span>}
      </div>

      <dl className="facts">
        <dt>Owner</dt>
        <dd>{who(s.ownerId)}</dd>
        <dt>Planned</dt>
        <dd>
          {clock(sc.baselineStart)}–{clock(sc.baselineEnd)} · {dur(s.durationMin)}
        </dd>
        <dt>Start</dt>
        <dd>
          {clock(sc.start)} <span className={`tag ${sc.startIsActual ? 'tag-fact' : 'tag-proj'}`}>{sc.startIsActual ? 'recorded' : 'projected'}</span>
          {x.startedBy && <span className="muted"> by {who(x.startedBy)}</span>}
        </dd>
        <dt>End</dt>
        <dd>
          {clock(sc.end)}{' '}
          <span className={`tag ${sc.endIsActual ? 'tag-fact' : sc.basis === 'assumption' ? 'tag-assume' : 'tag-proj'}`}>
            {sc.endIsActual ? 'recorded' : sc.basis === 'assumption' ? 'operator assumption' : sc.basis === 'overrun-floor' || sc.basis === 'blocked-floor' ? 'earliest possible' : 'projected'}
          </span>
          {!sc.endIsActual && sc.slipMin !== 0 && <span className="muted"> {signed(sc.slipMin)} vs baseline</span>}
        </dd>
        {s.mustFinishByMin !== undefined && (
          <>
            <dt>Deadline</dt>
            <dd>
              {s.constraintLabel}: {clock(plan.plannedStart + s.mustFinishByMin * MIN)}
            </dd>
          </>
        )}
        {x.blockedReason && (
          <>
            <dt>Blocker</dt>
            <dd className="bad">{x.blockedReason}</dd>
          </>
        )}
        {x.decision && (
          <>
            <dt>Decision</dt>
            <dd>
              {decisionLabel(x.decision)} by {who(x.decisionBy)} at {clock(x.decisionAt!)}
              {x.decisionNote ? `: ${x.decisionNote}` : ''}
            </dd>
          </>
        )}
      </dl>

      {s.deps.length > 0 && (
        <div className="sub">
          <h3>Waits for</h3>
          <ul className="links">
            {s.deps.map((d) => (
              <li key={d}>
                <button className="linkbtn" onClick={() => onSelect(d)}>
                  <span className={`dot tone-${stepTone(state.steps[d], proj.steps[d]).tone}`} /> <span className="sid">{d}</span> {title(d)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {impact.length > 0 && x.status !== 'done' && (
        <div className="sub">
          <h3>Downstream impact <span className="tag tag-proj">projection</span></h3>
          {impact.every((i) => i.slipMin <= 0) ? (
            <p className="muted small">No downstream step is projected later than baseline.</p>
          ) : (
            <ul className="links">
              {impact
                .filter((i) => i.slipMin > 0)
                .map((i) => (
                  <li key={i.id}>
                    <button className="linkbtn" onClick={() => onSelect(i.id)}>
                      <span className="sid">{i.id}</span> {title(i.id)}
                      <span className="num warn"> {signed(i.slipMin)}</span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      {live && roles.operator && s.kind === 'task' && (
        <div className="actions">
          {x.status === 'pending' && (
            <button className="btn btn-primary" disabled={busy || !sc.ready} onClick={() => act({ type: 'startStep', stepId: s.id })} title={sc.ready ? '' : 'Waiting for dependencies'}>
              Start step
            </button>
          )}
          {x.status === 'running' && (
            <button className="btn btn-primary" disabled={busy} onClick={() => act({ type: 'completeStep', stepId: s.id })}>
              Complete step
            </button>
          )}
          {x.status === 'blocked' && (
            <button className="btn btn-primary" disabled={busy} onClick={() => act({ type: 'unblockStep', stepId: s.id })}>
              Clear blocker
            </button>
          )}
        </div>
      )}

      {live && s.kind === 'gate' && x.status === 'pending' && (
        <div className="decision">
          <h3>Go/no-go decision</h3>
          {!sc.ready && <p className="muted small">Not ready: waiting for {s.deps.filter((d) => state.steps[d].status !== 'done').join(', ')}.</p>}
          {!roles.approver && <p className="muted small">Only an authorized approver can record this decision.</p>}
          {roles.approver && sc.ready && (
            <>
              <label>
                Evidence and conditions
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Required for a conditional go or a no-go" />
              </label>
              <div className="actions">
                <button className="btn btn-go" disabled={busy} onClick={needText((t) => ({ type: 'decideGate', stepId: s.id, decision: 'GO', note: t }))}>
                  Go
                </button>
                <button className="btn" disabled={busy || !text.trim()} onClick={needText((t) => ({ type: 'decideGate', stepId: s.id, decision: 'CONDITIONAL_GO', note: t }))}>
                  Conditional go
                </button>
                <button className="btn btn-danger" disabled={busy || !text.trim()} onClick={needText((t) => ({ type: 'decideGate', stepId: s.id, decision: 'NO_GO', note: t }))}>
                  No-go
                </button>
              </div>
              <p className="muted small">A no-go stops execution. It does not start a rollback.</p>
            </>
          )}
        </div>
      )}

      {live && s.kind === 'pnr' && x.status === 'pending' && (
        <div className="decision decision-pnr">
          <h3>Point of no return</h3>
          <p className="small">
            After this step starts, rollback is no longer available.{' '}
            {proj.rollback.level !== 'closed' ? `Rollback window: ${dur(proj.rollback.remainingMin)} left.` : 'The rollback window is already closed.'}
            {proj.constraints.some((c) => c.breached) && ' A deadline is currently projected to be missed.'}
          </p>
          {!sc.ready && <p className="muted small">Not ready: waiting for {s.deps.filter((d) => state.steps[d].status !== 'done').join(', ')}.</p>}
          {!roles.commander && <p className="muted small">Only a cutover commander can pass the point of no return.</p>}
          {roles.commander && sc.ready && (
            <>
              <label>
                Confirmation note
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Who confirmed, and on what basis" />
              </label>
              <button className="btn btn-danger" disabled={busy || !text.trim()} onClick={needText((t) => ({ type: 'confirmPnr', stepId: s.id, note: t }))}>
                Confirm and start {s.id}
              </button>
            </>
          )}
        </div>
      )}
      {live && s.kind === 'pnr' && x.status === 'running' && roles.operator && (
        <div className="actions">
          <button className="btn btn-primary" disabled={busy} onClick={() => act({ type: 'completeStep', stepId: s.id })}>
            Complete step
          </button>
        </div>
      )}

      {live && roles.operator && x.status !== 'done' && s.kind !== 'gate' && !(s.kind === 'pnr' && x.status === 'pending') && (
        <div className="ops">
          <label>
            Note, blocker or escalation
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} />
          </label>
          <div className="actions">
            <button className="btn" disabled={busy || !text.trim()} onClick={needText((t) => ({ type: 'addNote', stepId: s.id, text: t }))}>
              Add note
            </button>
            {(x.status === 'running' || x.status === 'pending') && s.kind === 'task' && (
              <button className="btn btn-danger" disabled={busy || !text.trim()} onClick={needText((t) => ({ type: 'blockStep', stepId: s.id, reason: t }))}>
                Mark blocked
              </button>
            )}
            <button className="btn" disabled={busy || !text.trim()} onClick={needText((t) => ({ type: 'escalate', stepId: s.id, text: t }))}>
              Escalate
            </button>
          </div>
          {(x.status === 'running' || x.status === 'blocked') && (
            <div className="assume">
              <label>
                Operator estimate: minutes still needed <span className="tag tag-assume">assumption</span>
                <input inputMode="numeric" value={remaining} onChange={(e) => setRemaining(e.target.value)} placeholder={x.assumedRemainingMin !== undefined ? String(x.assumedRemainingMin) : 'e.g. 20'} />
              </label>
              <button
                className="btn"
                disabled={busy || remaining.trim() === '' || !Number.isFinite(Number(remaining))}
                onClick={async () => {
                  if (await act({ type: 'setAssumption', stepId: s.id, remainingMin: Number(remaining) })) setRemaining('');
                }}
              >
                Use estimate
              </button>
              {x.assumedRemainingMin !== undefined && (
                <p className="muted small">
                  Current: {x.assumedRemainingMin} min, entered by {who(x.assumptionBy)} at {clock(x.assumptionAt!)}.
                </p>
              )}
            </div>
          )}
        </div>
      )}
      {!roles.operator && <p className="muted small">You have read-only access to this plan.</p>}
      <p className="muted small">Plan time now {clock(planNow)}.</p>
    </div>
  );
}

const eventText = (e: ExecEvent): string => {
  switch (e.type) {
    case 'PLAN_STARTED':
      return 'started the cutover';
    case 'STEP_STARTED':
      return `started ${e.stepId}`;
    case 'STEP_COMPLETED':
      return `completed ${e.stepId}`;
    case 'STEP_BLOCKED':
      return `marked ${e.stepId} blocked: ${e.text}`;
    case 'STEP_UNBLOCKED':
      return `cleared the blocker on ${e.stepId}`;
    case 'NOTE_ADDED':
      return `noted${e.stepId ? ` on ${e.stepId}` : ''}: ${e.text}`;
    case 'ESCALATED':
      return `escalated ${e.stepId}: ${e.text}`;
    case 'ASSUMPTION_SET':
      return `estimated ${e.minutes} min remaining on ${e.stepId}`;
    case 'GATE_DECIDED':
      return `recorded ${decisionLabel(e.decision!)} at ${e.stepId}${e.text ? `: ${e.text}` : ''}`;
    case 'PNR_CONFIRMED':
      return `passed the point of no return (${e.stepId}): ${e.text}`;
    case 'CLOCK_ADVANCED':
      return `advanced the simulated clock by ${e.minutes} min`;
  }
};

function Feed({ events, names, plannedStart, canNote, busy, act }: { events: ExecEvent[]; names: Record<string, string>; plannedStart: number; canNote: boolean; busy: boolean; act: (c: Command) => Promise<boolean> }) {
  const [note, setNote] = useState('');
  const list = [...events].reverse().slice(0, 40);
  return (
    <div className="card feed">
      <h2>Audit trail</h2>
      {canNote && (
        <form
          className="noteform"
          onSubmit={async (e) => {
            e.preventDefault();
            if (note.trim() && (await act({ type: 'addNote', text: note }))) setNote('');
          }}
        >
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Record an operational note" aria-label="Operational note" />
          <button className="btn" disabled={busy || !note.trim()}>
            Add
          </button>
        </form>
      )}
      {list.length === 0 && <p className="muted small">Nothing recorded yet.</p>}
      <ol className="events">
        {list.map((e) => (
          <li key={e.seq} className={`ev ev-${e.type}`}>
            <div className="ev-time">
              <span className="num">{clock(e.planTime)}</span>
              <span className="muted small">{tPlus(e.planTime, plannedStart)}</span>
            </div>
            <div className="ev-body">
              <strong>{names[e.actor.accountId] ?? 'Unknown user'}</strong> {eventText(e)}
              <div className="muted small">
                #{e.seq} · recorded {new Date(e.at).toLocaleString([], { hour12: false })} (server time)
                {e.simulated ? ' · plan time simulated' : ''}
                {e.source !== 'ui' ? ` · via ${e.source}` : ''}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
