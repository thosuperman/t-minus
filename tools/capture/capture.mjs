// Records the demo from the real T-Minus Forge app inside Jira (production install on the demo site).
// Every interaction is a real click or keystroke in the page. Output: screencast frames per scene + PNG screenshots.
//
//   node capture.mjs            full run (resets the demo plan first)
//
// Nothing here edits the picture: the only thing added on top of the page is a pointer dot, so viewers can follow clicks
// (a headless browser has no visible mouse cursor).
import fs from 'node:fs';
import path from 'node:path';
import { appFrame, appUrl, jira, launch, loggedIn, openApp, OUT, SITE, sleep } from './lib.mjs';

const KEY = 'FINERP';
const W = 1600;
const H = 900;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

fs.rmSync(path.join(OUT, 'scenes'), { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'scenes'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });

const { ctx, page } = await launch({ headless: true, scale: 2, width: W, height: H });
const cdp = await ctx.newCDPSession(page);
page.on('console', (m) => { if (m.type() === 'error' && /tminus|T-Minus|forge/i.test(m.text())) log('console error:', m.text().slice(0, 200)); });

// ---------- recorder ----------
let rec = null;
cdp.on('Page.screencastFrame', async (f) => {
  cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => undefined);
  if (!rec) return;
  const n = String(++rec.count).padStart(6, '0');
  fs.writeFileSync(path.join(rec.dir, `f${n}.jpg`), Buffer.from(f.data, 'base64'));
  rec.frames.push({ file: `f${n}.jpg`, t: Date.now() });
});
async function startScene(name) {
  const dir = path.join(OUT, 'scenes', name);
  fs.mkdirSync(dir, { recursive: true });
  rec = { name, dir, count: 0, frames: [], marks: [], t0: Date.now() };
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 93, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  await nudge();
  log('scene start', name);
}
/** Named moments inside a scene, so the edit can line narration up with what happens on screen. */
function mark(label) {
  if (rec) rec.marks.push({ label, t: Date.now() - rec.t0 });
}
async function endScene() {
  await sleep(250);
  await cdp.send('Page.stopScreencast');
  const r = rec;
  rec = null;
  const end = Date.now();
  fs.writeFileSync(path.join(r.dir, 'frames.json'), JSON.stringify({ t0: r.t0, end, frames: r.frames, marks: r.marks }));
  log('scene end', r.name, `${((end - r.t0) / 1000).toFixed(1)}s`, `${r.frames.length} frames`);
}
/** The screencast only emits frames when something repaints; move the pointer dot a hair to force one. */
async function nudge() {
  await page.evaluate(() => {
    const c = document.getElementById('tm-pointer');
    if (c) c.style.opacity = c.style.opacity === '0.99' ? '1' : '0.99';
  });
}

// ---------- pointer dot ----------
let mx = W / 2;
let my = H / 2;
async function installPointer() {
  await page.evaluate(() => {
    if (document.getElementById('tm-pointer')) return;
    const c = document.createElement('div');
    c.id = 'tm-pointer';
    c.style.cssText =
      'position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(242,163,58,.45);border:2px solid rgba(180,100,0,.9);pointer-events:none;z-index:2147483647;transition:transform .12s, background .12s;';
    document.body.appendChild(c);
  });
  await setPointer(mx, my);
}
async function setPointer(x, y, pressed = false) {
  await page.evaluate(
    ({ x, y, pressed }) => {
      const c = document.getElementById('tm-pointer');
      if (!c) return;
      c.style.left = `${x}px`;
      c.style.top = `${y}px`;
      c.style.transform = pressed ? 'scale(0.6)' : 'scale(1)';
      c.style.background = pressed ? 'rgba(242,163,58,.9)' : 'rgba(242,163,58,.45)';
    },
    { x, y, pressed },
  );
}
async function glide(x, y, ms = 550) {
  const steps = Math.max(6, Math.round(ms / 30));
  const x0 = mx;
  const y0 = my;
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    mx = x0 + (x - x0) * e;
    my = y0 + (y - y0) * e;
    await page.mouse.move(mx, my);
    await setPointer(mx, my);
    await sleep(28);
  }
}
async function center(loc) {
  await loc.waitFor({ state: 'visible', timeout: 30000 });
  await loc.scrollIntoViewIfNeeded().catch(() => undefined);
  await sleep(200);
  const b = await loc.boundingBox();
  if (!b) throw new Error('no bounding box');
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
async function hover(loc, hold = 600) {
  const c = await center(loc);
  await glide(c.x, c.y);
  await sleep(hold);
}
async function click(loc, { after = 900 } = {}) {
  const c = await center(loc);
  await glide(c.x, c.y);
  await sleep(220);
  await setPointer(mx, my, true);
  await sleep(110);
  await loc.click();
  await setPointer(mx, my, false);
  await sleep(after);
}
async function type(loc, text, { delay = 38 } = {}) {
  await click(loc, { after: 250 });
  await loc.pressSequentially(text, { delay });
  await sleep(500);
}
/** Smooth wheel scrolling at the pointer position. */
async function scroll(dy, ms = 900) {
  const steps = Math.max(8, Math.round(ms / 24));
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy / steps);
    await sleep(22);
  }
  await sleep(350);
}
async function shot(name, opts = {}) {
  await page.evaluate(() => (document.getElementById('tm-pointer').style.display = 'none'));
  await page.screenshot({ path: path.join(OUT, 'shots', `${name}.png`), ...opts });
  await page.evaluate(() => (document.getElementById('tm-pointer').style.display = ''));
  log('screenshot', name);
}

// ---------- app helpers ----------
let app;
const btn = (name) => app.getByRole('button', { name, exact: true });
const row = (id) => app.locator('.row', { has: app.locator('.sid', { hasText: new RegExp(`^${id}$`) }) });
const rowBtn = (id) => row(id).locator('.rowbtn');
/** Do an off-camera action and confirm its effect on the board; retry the click if the board was mid-update. */
async function sure(action, check, tries = 4) {
  for (let i = 0; i < tries; i++) {
    await action().catch(() => undefined);
    if (await check().then(() => true, () => false)) {
      await sleep(900);
      return;
    }
    log('action not confirmed, retrying. toasts:', (await app.locator('.toasts').innerText().catch(() => '?')).replace(/\n/g, ' ').slice(0, 200));
  }
  throw new Error('action could not be confirmed on the board');
}
const rowStatus = (id, re) => row(id).locator('.status').filter({ hasText: re }).waitFor({ timeout: 9000 });
async function waitText(text, timeout = 60000) {
  await app.getByText(text).first().waitFor({ timeout });
}
async function tidyJira() {
  // Cookie banner: keep only what is necessary.
  const only = page.getByRole('button', { name: 'Only necessary' });
  if (await only.isVisible().catch(() => false)) await only.click();
  await sleep(500);
  // Dismiss Jira onboarding pop-ups.
  for (const name of ['Got it', 'Dismiss', 'Not now']) {
    const b = page.getByRole('button', { name, exact: true }).first();
    if (await b.isVisible().catch(() => false)) await b.click().catch(() => undefined);
  }
  // Collapse Jira's left sidebar to give the app room.
  const collapse = page.getByRole('button', { name: /collapse sidebar/i }).first();
  if (await collapse.isVisible().catch(() => false)) await collapse.click();
  await sleep(600);
  await installPointer();
}
async function gotoApp() {
  app = await openApp(page, KEY);
  await tidyJira();
}
async function appTop() {
  await glide(W * 0.45, H * 0.6, 300);
  await scroll(-6000, 500);
}

// =====================================================================================
try {
  await page.goto(`${SITE}/jira/projects`, { waitUntil: 'domcontentloaded' });
  if (!(await loggedIn(page))) throw new Error('NOT_LOGGED_IN: run login.mjs first');

  // ---------- preparation (not recorded) ----------
  await gotoApp();
  await app.locator('.home, .board').first().waitFor({ timeout: 60000 });
  await sleep(2500);
  const existing = app.locator('.planlink').first();
  if (await existing.isVisible().catch(() => false)) {
    log('prep: existing plan found, resetting it');
    await existing.click();
    await app.locator('.board').waitFor({ timeout: 60000 });
    await btn('Reset demo').click();
    await btn('Delete this plan and start fresh').click();
    await waitText('Demo reset.', 120000);
    await waitText('The plan has not started', 90000);
  } else {
    log('prep: creating demo plan with Jira issues');
    await btn('Create demo plan').click();
    await waitText('The plan has not started', 120000);
  }
  await sleep(1500);
  let issues = [];
  for (let i = 0; i < 12 && issues.length < 17; i++) {
    issues = (await jira(page, '/rest/api/3/search/jql', { method: 'POST', data: { jql: `project = ${KEY} ORDER BY created ASC`, maxResults: 50, fields: ['summary', 'status'] } })).json?.issues ?? [];
    if (issues.length < 17) await sleep(5000);
  }
  if (issues.length < 17) throw new Error(`expected 17 Jira issues, found ${issues.length}`);
  log('prep: Jira issues in project', issues.length, issues.slice(0, 2).map((i) => `${i.key}:${i.fields.status.name}`).join(' '));
  const keyOf = (code) => issues.find((i) => i.fields.summary.startsWith(`[${code}]`))?.key;

  // ---------- scene 1: the problem (the runbook as plain Jira issues) ----------
  // Jira's list view can lag for a while after many issues change at once; reload until the runbook is listed.
  for (let i = 0; ; i++) {
    await page.goto(`${SITE}/jira/software/c/projects/${KEY}/list`, { waitUntil: 'domcontentloaded' });
    const seen = await page.getByText('[FRZ-1]').first().waitFor({ timeout: 15000 }).then(() => true, () => false);
    if (seen) break;
    if (i >= 12) throw new Error('Jira list view never showed the issues');
    log('list view empty, retrying');
    await sleep(8000);
  }
  await tidyJira();
  await sleep(2000);
  await startScene('s1_problem');
  await glide(W * 0.5, H * 0.55, 400);
  await sleep(3500);
  await scroll(420, 2600);
  await sleep(3000);
  await scroll(-420, 1800);
  await sleep(2500);
  await endScene();

  // ---------- scene 2: introducing T-Minus ----------
  await gotoApp();
  await app.locator('.planlink').first().waitFor({ timeout: 60000 });
  await sleep(1500);
  await startScene('s2_intro');
  await sleep(2500);
  await click(app.locator('.planlink').first(), { after: 400 });
  await app.locator('.board').waitFor({ timeout: 60000 });
  await sleep(3500);
  mark('board');
  await hover(app.locator('.kpi').nth(1), 1400);
  await hover(app.locator('.kpi').nth(3), 1400);
  await glide(W * 0.4, H * 0.7, 500);
  await scroll(520, 2600);
  await sleep(2200);
  await scroll(520, 2400);
  await sleep(2200);
  await scroll(-1100, 1800);
  await sleep(1500);
  await endScene();

  // ---------- scene 3: live execution ----------
  await startScene('s3_execute');
  await sleep(800);
  await click(btn('Start cutover'), { after: 2200 });
  mark('started');
  await click(app.getByRole('button', { name: 'Start FRZ-1' }), { after: 2400 });
  mark('step-started');
  await hover(app.locator('.events li').first(), 1800);
  await click(btn('Advance clock +15 min'), { after: 2200 });
  await click(app.getByRole('button', { name: 'Complete FRZ-1' }), { after: 2600 });
  mark('step-completed');
  await hover(app.locator('.events li').first(), 2200);
  await endScene();

  // Jira issue moved with the step (short clip + state for the Jira screenshot later).
  await startScene('s3b_fastforward');
  await sleep(600);
  await click(btn('Run scripted lead-up'), { after: 500 });
  mark('script');
  await app.getByText(/Over by 4\d min/).first().waitFor({ timeout: 180000 });
  await sleep(1200);
  mark('script-done');
  await sleep(2500);
  await endScene();

  // ---------- scene 4: the critical delay ----------
  await startScene('s4_delay');
  await sleep(1200);
  await hover(rowBtn('MIG-3'), 1600);
  await click(rowBtn('MIG-3'), { after: 2600 });
  mark('selected');
  await hover(app.locator('.panel .sub').last(), 3200);
  await shot('03_Critical_Delay');
  await appTop();
  await sleep(800);
  await hover(app.locator('.kpi').nth(1), 1600);
  await click(btn('Advance clock +30 min'), { after: 2800 });
  mark('advanced');
  await hover(app.locator('.kpi').nth(2), 2600);
  await hover(app.locator('.kpi').nth(1), 2200);
  await app.locator('.side').evaluate((el) => (el.scrollTop = 0));
  await glide(W * 0.3, H * 0.72, 500);
  await sleep(1500);
  await shot('01_Mission_Control');
  await glide(W * 0.4, H * 0.7, 300);
  await scroll(430, 1600);
  await sleep(1800);
  await shot('02_Live_Runbook');
  await sleep(1200);
  await endScene();

  // ---------- scene 5: the rollback decision window + second session ----------
  await appTop();
  await startScene('s5_rollback');
  await sleep(600);
  await hover(app.locator('.kpi-rollback'), 5500);
  mark('window');
  await shot('04_Rollback_Clock');
  await sleep(1500);
  // A second browser session (another tab, same demo account) records a blocker. Not shown; only its effect is.
  const p2 = await ctx.newPage();
  await p2.goto(appUrl(KEY), { waitUntil: 'domcontentloaded' });
  const app2 = appFrame(p2);
  await app2.locator('.planlink').first().click({ timeout: 90000 });
  await app2.locator('.row', { has: app2.locator('.sid', { hasText: /^MIG-3$/ }) }).locator('.rowbtn').click();
  await app2.locator('.ops textarea').fill('Batch 5 failed: tablespace FIN_DATA full. DBA paged.');
  mark('second-session-acts');
  await app2.getByRole('button', { name: 'Mark blocked', exact: true }).click();
  await page.bringToFront();
  await app.getByText('Step blocked').first().waitFor({ timeout: 30000 });
  mark('blocked-visible');
  await hover(app.locator('.topbar .chips'), 2500);
  await hover(app.locator('.events li').first(), 3000);
  await endScene();
  await p2.close();

  // ---------- scene 6: Rovo Situation Commander ----------
  await startScene('s6_rovo');
  await sleep(600);
  await click(page.getByRole('button', { name: /Ask Rovo/i }).first(), { after: 2500 });
  await click(page.getByRole('button', { name: /Change agent/i }).first(), { after: 1500 });
  await click(page.getByText('Browse agents', { exact: true }).first(), { after: 2500 });
  await click(page.getByRole('button', { name: 'Chat with T-Minus Situation Commander' }).first(), { after: 2500 });
  mark('agent-open');
  const input = page.getByRole('textbox', { name: /Ask, @mention|Describe what you want/i }).last();
  await type(input, 'Are we still on schedule, and what decisions are needed right now?', { delay: 34 });
  await page.keyboard.press('Enter');
  mark('asked');
  await page.getByRole('button', { name: /Good response/i }).last().waitFor({ timeout: 120000 });
  mark('answered');
  await sleep(1500);
  // Read the answer from its start: scroll the chat up, pause, then down again.
  await glide(W * 0.86, H * 0.45, 400);
  await scroll(-900, 1200);
  await sleep(4500);
  await shot('06_Rovo_Agent');
  await scroll(450, 3000);
  await sleep(3500);
  await scroll(450, 2600);
  await sleep(3000);
  const answer = await page.evaluate(() => {
    const t = document.body.innerText;
    const i = t.lastIndexOf('Are we still on schedule');
    return t.slice(i, i + 1800);
  });
  fs.writeFileSync(path.join(OUT, 'rovo_answer.txt'), answer);
  await endScene();
  // close the Rovo panel
  const close = page.getByRole('button', { name: /^Close/i }).last();
  if (await close.isVisible().catch(() => false)) await close.click();
  await sleep(800);

  // ---------- scene 7: go/no-go ----------
  // Off camera: the migration and reconciliation finish (real clicks, same as an operator would do).
  // Reload the app first: after the long Rovo session, clicks in the old page stopped reaching the board.
  await gotoApp();
  await app.locator('.planlink').first().click();
  await app.locator('.board').waitFor({ timeout: 60000 });
  await sleep(2500);
  await rowBtn('MIG-3').click();
  await sure(() => btn('Clear blocker').click(), () => rowStatus('MIG-3', /Over by|Running/));
  await sure(() => app.getByRole('button', { name: 'Complete MIG-3' }).click(), () => rowStatus('MIG-3', /Done/));
  for (const id of ['REC-1', 'REC-2']) {
    await sure(() => app.getByRole('button', { name: `Start ${id}` }).click(), () => rowStatus(id, /Running/));
  }
  await btn('Advance clock +30 min').click();
  await sleep(2000);
  await sure(() => app.getByRole('button', { name: 'Complete REC-1' }).click(), () => rowStatus('REC-1', /Done/));
  await appTop();
  await sleep(600);
  await startScene('s7_gonogo');
  await sleep(1000);
  await click(app.getByRole('button', { name: 'Complete REC-2' }), { after: 2600 });
  mark('ready');
  await hover(app.locator('.banner-decision'), 1500);
  await click(app.locator('.banner-decision .btn').first(), { after: 2200 });
  mark('panel');
  await type(app.locator('.decision textarea'), 'Trial balance variance 0.00. Three open items parked under FIN-221, accepted by the controller.', { delay: 30 });
  await sleep(900);
  await shot('05_Go_NoGo');
  await click(btn('Conditional go'), { after: 2800 });
  mark('decided');
  await hover(app.locator('.events li').first(), 3500);
  await shot('05b_Decision_Recorded');
  await endScene();

  // ---------- scene 7b: Jira integration ----------
  const gate = keyOf('GATE-1');
  await page.goto(`${SITE}/browse/${gate}`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Go/No-Go: Finance sign-off').first().waitFor({ timeout: 60000 });
  await tidyJira();
  await sleep(3500);
  await startScene('s7b_jira');
  await glide(W * 0.45, H * 0.5, 400);
  await sleep(2500);
  await scroll(380, 2000);
  await sleep(3500);
  await shot('07_Jira_Integration');
  await endScene();

  // ---------- scene 8: closing ----------
  await gotoApp();
  await click(app.locator('.planlink').first(), { after: 400 });
  await app.locator('.board').waitFor({ timeout: 60000 });
  await sleep(2500);
  await startScene('s8_close');
  await glide(W * 0.5, H * 0.45, 500);
  await sleep(2500);
  await scroll(360, 2600);
  await sleep(4500);
  await endScene();
  log('DONE');
} catch (e) {
  log('ERROR', e.message.split('\n').slice(0, 6).join(' | '));
  await page.screenshot({ path: path.join(OUT, 'capture-error.png') }).catch(() => undefined);
  if (rec) await endScene().catch(() => undefined);
  process.exitCode = 1;
} finally {
  await ctx.close();
}
