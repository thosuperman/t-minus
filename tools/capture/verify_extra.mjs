// On-site check of features the recorded demo does not exercise: import from Jira, escalation, operator estimate, plan deletion.
import { launch, openApp, sleep } from './lib.mjs';
const { ctx, page } = await launch({ headless: true, scale: 1, width: 1600, height: 900 });
const out = [];
const check = (name, pass, detail = '') => { out.push({ name, pass, detail }); console.log(pass ? 'PASS' : 'FAIL', name, detail); };
try {
  const app = await openApp(page, 'GOLIVE');
  await app.locator('.home').waitFor({ timeout: 60000 });
  await sleep(2500);
  const before = await app.locator('.planlink').count();
  await app.getByPlaceholder(/Cutover GOLIVE/).fill('Imported rehearsal');
  await app.getByLabel('Rehearsal mode (simulated clock)').check();
  await app.getByRole('button', { name: 'Import from GOLIVE' }).click();
  await app.locator('.board').waitFor({ timeout: 90000 });
  await sleep(1500);
  const rows = await app.locator('.row').count();
  check('import: every Jira issue of the project becomes a step', rows === 17, `${rows} steps`);
  const title = await app.locator('.topbar h1').innerText();
  check('import: plan name used', title === 'Imported rehearsal', title);
  const gates = await app.locator('.row .tag', { hasText: 'Go/no-go' }).count();
  const pnr = await app.locator('.row .tag', { hasText: 'Point of no return' }).count();
  check('import: labels become checkpoints and the point of no return', gates === 2 && pnr === 1, `${gates} gates, ${pnr} point of no return`);
  const finish = await app.locator('.kpi').nth(1).innerText();
  check('import: Blocks links become dependencies (critical path shown)', (await app.locator('.row .tag-crit').count()) >= 5, finish.replace(/\n/g, ' ').slice(0, 70));
  await app.getByRole('button', { name: 'Start cutover', exact: true }).click();
  await app.getByText('Live', { exact: true }).first().waitFor({ timeout: 30000 });
  const first = app.locator('.quick .btn', { hasText: 'Start' }).first();
  const label = await first.getAttribute('aria-label');
  await first.click();
  await sleep(3500);
  const id = label.replace('Start ', '');
  const row = app.locator('.row', { has: app.locator('.sid', { hasText: new RegExp(`^${id}$`) }) });
  check('execute: a ready imported step can be started', /Running/.test(await row.locator('.status').innerText()), id);
  await row.locator('.rowbtn').click();
  await sleep(800);
  await app.locator('.ops textarea').fill('Need the DBA on the bridge call.');
  await app.getByRole('button', { name: 'Escalate', exact: true }).click();
  await sleep(3500);
  check('escalation: recorded and flagged on the step', (await row.locator('.tag-bad', { hasText: 'Escalated' }).count()) === 1, (await app.locator('.events li').first().innerText()).replace(/\n/g, ' ').slice(0, 90));
  await app.locator('.assume input').fill('20');
  await app.getByRole('button', { name: 'Use estimate', exact: true }).click();
  await sleep(3500);
  const panel = await app.locator('.panel').innerText();
  check('operator estimate: used for the projection and labelled as an assumption', /operator assumption/.test(panel) && /Current: 20 min/.test(panel), '');
  const assumptions = await app.locator('.assumptions').innerText().catch(() => '');
  check('operator estimate: listed under "What the projection assumes"', /assumption, not a measurement/.test(assumptions), '');
  // clean up: delete the imported plan
  await app.getByRole('button', { name: 'Back to plans' }).click();
  await app.locator('.home').waitFor();
  await sleep(1500);
  const item = app.locator('.planlist li', { hasText: 'Imported rehearsal' });
  await item.getByRole('button', { name: 'Delete', exact: true }).click();
  await item.getByRole('button', { name: 'Delete plan and audit trail' }).click();
  await sleep(4000);
  check('delete: imported plan removed', (await app.locator('.planlink').count()) === before, `${before} plans before and after`);
} catch (e) { check('run completed', false, e.message.split('\n')[0]); }
finally { await ctx.close(); }
console.log(JSON.stringify({ passed: out.every((o) => o.pass), count: out.length }));
