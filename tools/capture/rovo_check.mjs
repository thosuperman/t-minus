// Asks the deployed Rovo agent real questions on the demo site and saves its answers verbatim.
// Run smoke.mjs first so the demo plan is in a known state (lead-up done, migration overrunning).
// Usage: node rovo_check.mjs [PROJECT_KEY]   Output: out/rovo/answers.json and a screenshot per question.
import fs from 'node:fs';
import path from 'node:path';
import { launch, openApp, sleep, OUT, SITE } from './lib.mjs';

const KEY = process.argv[2] ?? 'FINERP';
const QUESTIONS = [
  'Are we still on schedule, and what decisions are needed right now?',
  'What is blocked or late, and what does the MIG-3 delay affect downstream?',
  'Write a short executive update for the CFO.',
];
const dir = path.join(OUT, 'rovo');
fs.mkdirSync(dir, { recursive: true });
const { ctx, page } = await launch({ headless: true, width: 1600, height: 1000 });
const answers = [];
try {
  // Read the board state first, so the answers can be compared with what the app shows.
  const app = await openApp(page, KEY);
  await sleep(3000);
  if (await app.locator('.home').count()) await app.locator('.planlink', { hasText: 'synthetic demo' }).first().click();
  await app.locator('.board').waitFor({ timeout: 90000 });
  await sleep(3000);
  const board = (await app.locator('.kpis, .kpi').allInnerTexts()).join(' | ').replace(/\s+/g, ' ');
  await page.goto(`${SITE}/jira`, { waitUntil: 'domcontentloaded' });
  await sleep(4000);
  await page.getByRole('button', { name: /Ask Rovo/i }).first().click();
  await sleep(3000);
  await page.getByRole('button', { name: /Change agent/i }).first().click();
  await sleep(1500);
  await page.getByText('Browse agents', { exact: true }).first().click();
  await sleep(3000);
  await page.getByRole('button', { name: 'Chat with T-Minus Situation Commander' }).first().click();
  await sleep(3000);
  for (const [i, q] of QUESTIONS.entries()) {
    const before = await page.getByRole('button', { name: /Good response/i }).count();
    const input = page.getByRole('textbox', { name: /Ask, @mention|Describe what you want/i }).last();
    await input.click();
    await input.fill(q);
    await page.keyboard.press('Enter');
    const deadline = Date.now() + 180000;
    while ((await page.getByRole('button', { name: /Good response/i }).count()) <= before && Date.now() < deadline) await sleep(2000);
    await sleep(2500);
    const text = await page.evaluate((q) => {
      const t = document.body.innerText;
      const at = t.lastIndexOf(q);
      return t.slice(at + q.length, at + q.length + 2500);
    }, q);
    answers.push({ question: q, answer: text.trim() });
    await page.screenshot({ path: path.join(dir, `q${i + 1}.png`) });
    console.log(`Q${i + 1}: ${q}\n${text.trim().slice(0, 1200)}\n`);
  }
  fs.writeFileSync(path.join(dir, 'answers.json'), JSON.stringify({ at: new Date().toISOString(), board, answers }, null, 2));
  console.log('BOARD:', board);
} catch (e) {
  console.log('ERROR', String(e.message || e).split('\n')[0]);
  await page.screenshot({ path: path.join(dir, 'error.png') }).catch(() => {});
} finally {
  await ctx.close();
}
