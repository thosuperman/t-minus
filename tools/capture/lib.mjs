// Shared helpers for driving the real T-Minus Forge app inside Jira with a real Chrome window.
// The Chrome profile lives in ./.profile so the Atlassian login (typed by a human, once) is reused.
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SITE = 'https://one-atlas-egic.atlassian.net';
export const APP_ID = '6285d46c-4ef6-4efb-8d0b-6146906c6ce1';
export const OUT = path.join(HERE, 'out');

export async function launch({ video = false, headless = false, scale = 1, width = 1920, height = 1080 } = {}) {
  const ctx = await chromium.launchPersistentContext(path.join(HERE, '.profile'), {
    channel: 'chrome',
    headless,
    viewport: { width, height },
    deviceScaleFactor: scale,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--disable-blink-features=AutomationControlled', `--window-size=${width},${height + 90}`, '--hide-crash-restore-bubble'],
    ...(video ? { recordVideo: { dir: path.join(OUT, 'raw'), size: { width, height } } } : {}),
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  return { ctx, page };
}

export async function loggedIn(page) {
  try {
    const r = await page.request.get(`${SITE}/rest/api/3/myself`, { headers: { Accept: 'application/json' } });
    return r.ok();
  } catch {
    return false;
  }
}

// Environment id of the production installation, as it appears in the app's URL inside Jira.
export const ENV_ID = '56c63882-af01-44b6-b241-489d14166fb5';
export const appUrl = (projectKey) => `${SITE}/jira/software/projects/${projectKey}/apps/${APP_ID}/${ENV_ID}`;

/** Open the T-Minus tab of a Jira project and return the app frame. */
export async function openApp(page, projectKey = 'FINERP') {
  await page.goto(appUrl(projectKey), { waitUntil: 'domcontentloaded' });
  const app = appFrame(page);
  await app.locator('.app').waitFor({ timeout: 90000 });
  return app;
}

export function appFrame(page) {
  return page.frameLocator('iframe[src*="atlassian-dev.net"], iframe[src*="cdn.prod.atlassian"]').first();
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Call Jira REST from inside the page, so the browser session and its XSRF rules apply. */
export async function jira(page, url, { method = 'GET', data } = {}) {
  return page.evaluate(
    async ({ url, method, data }) => {
      const r = await fetch(url, {
        method,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Atlassian-Token': 'no-check' },
        body: data ? JSON.stringify(data) : undefined,
      });
      const text = await r.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {}
      return { ok: r.ok, status: r.status, json, text: text.slice(0, 300) };
    },
    { url, method, data },
  );
}
