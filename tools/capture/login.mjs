// Opens a Chrome window on the Atlassian login page and waits until a human has signed in.
// Nothing is typed by this script. The session is kept in ./.profile for the capture scripts.
import { launch, loggedIn, SITE, sleep } from './lib.mjs';

const { ctx, page } = await launch({ width: 1280, height: 800 });
await page.goto(`${SITE}/jira/projects`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
const deadline = Date.now() + 15 * 60_000;
let ok = false;
while (Date.now() < deadline) {
  if (await loggedIn(page)) {
    ok = true;
    break;
  }
  await sleep(3000);
}
console.log(ok ? 'LOGGED_IN' : 'TIMED_OUT');
await sleep(1500);
await ctx.close();
process.exit(ok ? 0 : 1);
