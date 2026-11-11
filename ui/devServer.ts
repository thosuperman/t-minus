// Local development harness only. It is not part of the Forge app.
// It serves the same dispatch table as the Forge resolver, backed by an in-memory store and a fake Jira,
// so the UI and multi-client behaviour can be exercised in a browser without deploying.
import type { Plugin } from 'vite';
import { dispatch } from '../src/core/api';
import { createService, Ctx, JiraPort } from '../src/core/service';
import { MemoryStore } from '../src/core/store';

const users: Record<string, string> = { lena: 'Lena Lead', omar: 'Omar Operator', vera: 'Vera Viewer' };

export function devApi(): Plugin {
  const svc = createService(new MemoryStore());
  let n = 0;
  const jiraFor = (user: string): JiraPort => ({
    canEdit: async () => user !== 'vera',
    userNames: async (ids) => Object.fromEntries(ids.filter((id) => users[id]).map((id) => [id, users[id]])),
    transition: async () => ({ ok: true }),
    comment: async () => ({ ok: true }),
    importSteps: async () => [],
    createIssues: async (_p, steps) => Object.fromEntries(steps.map((s) => [s.id, `CUT-${++n}`])),
  });
  return {
    name: 'tminus-dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev/invoke', (req, res) => {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', async () => {
          const { fn, payload, user = 'lena' } = JSON.parse(body || '{}');
          const ctx: Ctx = { actor: { accountId: user }, source: 'ui', jira: jiraFor(user) };
          const out = await dispatch(svc, ctx, fn, payload);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(out));
        });
      });
    },
  };
}
