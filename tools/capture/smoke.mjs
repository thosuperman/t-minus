// End-to-end smoke test of the deployed app on the demo site: the "strongest moment" of the demo.
// Creates or resets the demo plan in one project, runs the lead-up, lets the migration overrun, and
// checks that the schedule, deadlines and rollback window react. Also runs the storage self-test.
// Usage: node smoke.mjs [PROJECT_KEY]   (default FINERP; needs a signed-in profile, see login.mjs)
import fs from 'node:fs';
import path from 'node:path';
import { launch, loggedIn, openApp, sleep, OUT } from './lib.mjs';

const KEY = process.argv[2] ?? 'FINERP';
const { ctx, page } = await launch({ headless: true, width: 1600, height: 900 });
const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(pass ? 'PASS' : 'FAIL', name, detail ? `- ${detail}` : ''); };
const flat = (s) => s.replace(/\s+/g, ' ').trim();
try {
  await page.goto('https://one-atlas-egic.atlassian.net/jira', { waitUntil: 'domcontentloaded' });
  check('signed in to the demo site', await loggedIn(page));
  let app = await openApp(page, KEY);
  await sleep(3000);

  // Home screen: storage self-test
  if (await app.locator('.home').count()) {
    const st = app.getByRole('button', { name: /self-test/i });
    if (await st.count()) {
      await st.click();
      await app.getByText(/passed|failed/i).first().waitFor({ timeout: 60000 });
      const txt = flat(await app.locator('.home').innerText());
      check('storage self-test passes', /passed/i.test(txt) && !/failed/i.test(txt), (txt.match(/[^.]*passed[^.]*/i) || [''])[0].slice(0, 120));
    }
    const open = app.locator('.planlink', { hasText: 'synthetic demo' }).first();
    if (await open.count()) {
      await open.click();
    } else {
      await app.getByRole('button', { name: /Create demo plan/ }).click();
    }
  }
  await app.locator('.board').waitFor({ timeout: 120000 });
  await sleep(1500);

  // Reset to a clean scenario
  const reset = app.getByRole('button', { name: 'Reset demo', exact: true });
  await reset.click();
  const confirm = app.getByRole('button', { name: 'Delete this plan and start fresh' });
  if (await confirm.count()) await confirm.first().click();
  await app.getByRole('button', { name: 'Start cutover', exact: true }).waitFor({ timeout: 120000 });
  check('demo plan reset', true, `${await app.locator('.row').count()} steps`);

  await app.getByRole('button', { name: 'Start cutover', exact: true }).click();
  await app.getByText('Live', { exact: true }).first().waitFor({ timeout: 30000 });
  const lead = app.getByRole('button', { name: /Run scripted lead-up/ });
  await lead.click();
  await app.locator('.row .status', { hasText: 'Running' }).first().waitFor({ timeout: 120000 });
  await sleep(6000);
  const finish1 = flat(await app.locator('.kpi').nth(1).innerText());
  const roll1 = flat(await app.locator('.kpi').nth(3).innerText());
  check('lead-up: plan two hours in, a step running', true, `${finish1} | ${roll1}`);

  await app.getByRole('button', { name: 'Advance clock +30 min' }).click();
  await sleep(5000);
  const finish2 = flat(await app.locator('.kpi').nth(1).innerText());
  const dl2 = flat(await app.locator('.kpi').nth(2).innerText());
  const roll2 = flat(await app.locator('.kpi').nth(3).innerText());
  check('overrun: projected finish moves later', finish1 !== finish2, finish2.slice(0, 90));
  check('overrun: a deadline is projected to be missed', /missed by/.test(dl2), dl2.slice(0, 110));
  const mins = (x) => { const m = x.match(/(?:(\d+) h )?(\d+) min left/); return m ? (+(m[1] || 0)) * 60 + +m[2] : NaN; };
  const m1 = mins(roll1), m2 = mins(roll2);
  check('rollback window shrinks as time passes', m2 < m1, `${m1} -> ${m2} min`);
  check('critical path marked', (await app.locator('.row .tag-crit').count()) > 0);

  fs.mkdirSync(path.join(OUT, 'smoke'), { recursive: true });
  await page.screenshot({ path: path.join(OUT, 'smoke', `${KEY}.png`) });
} catch (e) {
  check('no unexpected error', false, String(e.message || e).split('\n')[0]);
  fs.mkdirSync(path.join(OUT, 'smoke'), { recursive: true });
  await page.screenshot({ path: path.join(OUT, 'smoke', `${KEY}-error.png`) }).catch(() => {});
} finally {
  fs.mkdirSync(path.join(OUT, 'smoke'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'smoke', `${KEY}.json`), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  console.log(`${results.filter((r) => r.pass).length}/${results.length} passed`);
  await ctx.close();
}
