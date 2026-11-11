// Synthetic demo scenario: an ERP finance cutover weekend. All names and data are invented.
import { Command, PlanDef, StepDef } from './types';

type S = Omit<StepDef, 'deps'> & { deps?: string[] };

const steps: S[] = [
  { id: 'FRZ-1', title: 'Announce freeze and disable AP/AR postings in legacy ERP', kind: 'task', durationMin: 15, workstream: 'Freeze & backup' },
  { id: 'FRZ-2', title: 'Close accounting period P10 in legacy general ledger', kind: 'task', durationMin: 30, workstream: 'Freeze & backup', deps: ['FRZ-1'] },
  { id: 'BKP-1', title: 'Full backup of legacy ERP database (rollback baseline)', kind: 'task', durationMin: 45, workstream: 'Freeze & backup', deps: ['FRZ-1'] },
  { id: 'MIG-1', title: 'Extract GL balances and open items', kind: 'task', durationMin: 40, workstream: 'Finance data migration', deps: ['FRZ-2'] },
  { id: 'MIG-2', title: 'Migrate vendor and customer master data', kind: 'task', durationMin: 60, workstream: 'Finance data migration', deps: ['BKP-1'] },
  { id: 'MIG-3', title: 'Load GL balances and open items into new ERP', kind: 'task', durationMin: 90, workstream: 'Finance data migration', deps: ['MIG-1', 'MIG-2'] },
  { id: 'INT-1', title: 'Deploy integration endpoints (payments, bank, payroll)', kind: 'task', durationMin: 30, workstream: 'Interfaces', deps: ['BKP-1'] },
  { id: 'INT-2', title: 'Interface smoke test against bank sandbox', kind: 'task', durationMin: 30, workstream: 'Interfaces', deps: ['INT-1'] },
  { id: 'REC-1', title: 'Reconcile trial balance: legacy vs new ERP', kind: 'task', durationMin: 45, workstream: 'Reconciliation', deps: ['MIG-3'] },
  { id: 'REC-2', title: 'Reconcile AP/AR subledger totals and open item counts', kind: 'task', durationMin: 40, workstream: 'Reconciliation', deps: ['MIG-3'] },
  { id: 'GATE-1', title: 'Go/No-Go: Finance sign-off on reconciliation', kind: 'gate', durationMin: 10, workstream: 'Decisions', deps: ['REC-1', 'REC-2', 'INT-2'] },
  { id: 'PNR-1', title: 'Activate ERP interfaces and redirect bank connectivity', kind: 'pnr', durationMin: 20, workstream: 'Go-live', deps: ['GATE-1'] },
  { id: 'PAY-1', title: 'Generate first payment run in new ERP', kind: 'task', durationMin: 30, workstream: 'Go-live', deps: ['PNR-1'] },
  { id: 'PAY-2', title: 'Submit bank payment file', kind: 'task', durationMin: 15, workstream: 'Go-live', deps: ['PAY-1'], mustFinishByMin: 390, constraintLabel: 'Bank payment file cutoff' },
  { id: 'VAL-1', title: 'Business validation of first postings', kind: 'task', durationMin: 30, workstream: 'Go-live', deps: ['PNR-1'] },
  { id: 'GATE-2', title: 'Go/No-Go: Final business sign-off', kind: 'gate', durationMin: 10, workstream: 'Decisions', deps: ['PAY-2', 'VAL-1'] },
  { id: 'COM-1', title: 'Open system to users and hand over to hypercare', kind: 'task', durationMin: 15, workstream: 'Go-live', deps: ['GATE-2'] },
];

export const DEMO_NAME = 'Finance ERP cutover (synthetic demo)';

export function demoSteps(): StepDef[] {
  return steps.map((s) => ({ ...s, deps: s.deps ?? [] }));
}

export function buildDemoPlan(id: string, now: number, creator: string, projectKey?: string): PlanDef {
  return {
    id,
    name: DEMO_NAME,
    projectKey,
    plannedStart: Math.floor(now / 60_000) * 60_000,
    windowEndMin: 420, // 7h cutover window
    windowLabel: 'Cutover window ends (business opens)',
    rollbackDurationMin: 90,
    commanders: [creator],
    approvers: [creator],
    simulation: true,
    createdBy: creator,
    createdAt: now,
    steps: demoSteps(),
  };
}

/**
 * Scripted run-up for reviewers: executes real commands through the normal validation path,
 * advancing the simulated clock between them, and stops with MIG-3 running 45 min over plan.
 */
export function demoScript(): Command[] {
  const adv = (minutes: number): Command => ({ type: 'advanceClock', minutes });
  const start = (stepId: string): Command => ({ type: 'startStep', stepId });
  const done = (stepId: string): Command => ({ type: 'completeStep', stepId });
  return [
    { type: 'startPlan' },
    start('FRZ-1'), adv(15), done('FRZ-1'),
    start('FRZ-2'), start('BKP-1'), adv(30), done('FRZ-2'),
    start('MIG-1'), adv(15), done('BKP-1'),
    start('MIG-2'), start('INT-1'), adv(25), done('MIG-1'),
    adv(5), done('INT-1'), start('INT-2'), adv(30), done('INT-2'), done('MIG-2'),
    start('MIG-3'),
    { type: 'addNote', stepId: 'MIG-3', text: 'Load started. Batch 1 of 6 running.' },
    adv(90),
    { type: 'addNote', stepId: 'MIG-3', text: 'Planned duration reached. Batch 4 of 6 still loading; open-item load slower than rehearsal.' },
    adv(45),
  ];
}
