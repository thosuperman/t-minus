// Jira adapter. All calls run as the acting user, so Jira's own permissions apply.
import api, { assumeTrustedRoute, route } from '@forge/api';
import { JiraPort } from '../core/service';
import { StepDef, StepKind } from '../core/types';

const json = { Accept: 'application/json', 'Content-Type': 'application/json' };
const adf = (text: string) => ({ type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

async function fail(res: { status: number; text: () => Promise<string> }, what: string): Promise<never> {
  const body = (await res.text()).slice(0, 300);
  throw new Error(`${what} failed (HTTP ${res.status}): ${body}`);
}

/**
 * Look up display names for account ids. Used at read time only; the result is returned to the caller and never stored.
 * `as` selects whose permissions apply: the acting user (UI) or the app (Rovo actions).
 */
export async function lookupNames(accountIds: string[], as: 'user' | 'app' = 'user'): Promise<Record<string, string>> {
  const ids = [...new Set(accountIds)].filter((id) => /^[A-Za-z0-9:_-]{1,128}$/.test(id)).slice(0, 50);
  if (ids.length === 0) return {};
  const query = ids.map((id) => `accountId=${encodeURIComponent(id)}`).join('&');
  const client = as === 'app' ? api.asApp() : api.asUser();
  // Ids are validated against a strict pattern above, so the composed route is safe.
  const res = await client.requestJira(assumeTrustedRoute(`/rest/api/3/user/bulk?maxResults=50&${query}`), { headers: json });
  if (!res.ok) return {};
  const data = await res.json();
  const out: Record<string, string> = {};
  for (const u of data?.values ?? []) if (u?.accountId && u?.displayName) out[u.accountId] = u.displayName;
  return out;
}

export const jiraPort: JiraPort = {
  userNames: (ids) => lookupNames(ids, 'user'),

  async canEdit(projectKey) {
    const res = await api.asUser().requestJira(route`/rest/api/3/mypermissions?projectKey=${projectKey}&permissions=EDIT_ISSUES`, { headers: json });
    if (!res.ok) return false;
    const data = await res.json();
    return !!data?.permissions?.EDIT_ISSUES?.havePermission;
  },

  async transition(issueKey, target) {
    const res = await api.asUser().requestJira(route`/rest/api/3/issue/${issueKey}/transitions`, { headers: json });
    if (!res.ok) return { ok: false, message: `HTTP ${res.status} reading transitions` };
    const { transitions } = await res.json();
    const current = await api.asUser().requestJira(route`/rest/api/3/issue/${issueKey}?fields=status`, { headers: json });
    if (current.ok && (await current.json())?.fields?.status?.statusCategory?.key === target) return { ok: true }; // already there
    const t = (transitions ?? []).find((x: any) => x?.to?.statusCategory?.key === target);
    if (!t) return { ok: false, message: `no available transition to a "${target}" status` };
    const post = await api.asUser().requestJira(route`/rest/api/3/issue/${issueKey}/transitions`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ transition: { id: t.id } }),
    });
    return post.ok ? { ok: true } : { ok: false, message: `HTTP ${post.status} applying transition` };
  },

  async comment(issueKey, text) {
    const res = await api.asUser().requestJira(route`/rest/api/3/issue/${issueKey}/comment`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ body: adf(text) }),
    });
    return res.ok ? { ok: true } : { ok: false, message: `HTTP ${res.status}` };
  },

  async importSteps(projectKey, jql) {
    const query = jql?.trim() || `project = "${projectKey}" ORDER BY created ASC`;
    const issues: any[] = [];
    let nextPageToken: string | undefined;
    do {
      const res = await api.asUser().requestJira(route`/rest/api/3/search/jql`, {
        method: 'POST',
        headers: json,
        body: JSON.stringify({
          jql: query,
          maxResults: 100,
          nextPageToken,
          fields: ['summary', 'assignee', 'issuelinks', 'timeoriginalestimate', 'labels', 'components'],
        }),
      });
      if (!res.ok) return fail(res, 'Searching Jira issues');
      const page = await res.json();
      issues.push(...(page.issues ?? []));
      nextPageToken = page.nextPageToken;
    } while (nextPageToken && issues.length < 300);

    const keys = new Set(issues.map((i) => i.key));
    return issues.map((i): StepDef => {
      const f = i.fields ?? {};
      const labels: string[] = f.labels ?? [];
      const kind: StepKind = labels.includes('tminus-pnr') ? 'pnr' : labels.includes('tminus-gate') ? 'gate' : 'task';
      const deps = (f.issuelinks ?? [])
        // On a "Blocks" link, inwardIssue is the issue that blocks this one.
        .filter((l: any) => l?.type?.name === 'Blocks' && l.inwardIssue && keys.has(l.inwardIssue.key))
        .map((l: any) => l.inwardIssue.key as string);
      return {
        id: i.key,
        issueKey: i.key,
        title: f.summary ?? i.key,
        kind,
        durationMin: f.timeoriginalestimate ? Math.max(1, Math.round(f.timeoriginalestimate / 60)) : 30,
        deps: [...new Set<string>(deps)],
        workstream: f.components?.[0]?.name ?? 'General',
        ownerId: f.assignee?.accountId,
      };
    });
  },

  async createIssues(projectKey, steps) {
    const typesRes = await api.asUser().requestJira(route`/rest/api/3/issue/createmeta/${projectKey}/issuetypes`, { headers: json });
    if (!typesRes.ok) return fail(typesRes, 'Reading issue types');
    const types: any[] = (await typesRes.json()).issueTypes ?? [];
    const type = types.find((t) => !t.subtask && t.name === 'Task') ?? types.find((t) => !t.subtask && t.hierarchyLevel === 0) ?? types.find((t) => !t.subtask);
    if (!type) throw new Error(`Project ${projectKey} has no usable issue type.`);

    const res = await api.asUser().requestJira(route`/rest/api/3/issue/bulk`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify({
        issueUpdates: steps.map((s) => ({
          fields: {
            project: { key: projectKey },
            issuetype: { id: type.id },
            summary: `[${s.id}] ${s.title}`,
            labels: ['tminus', 'tminus-demo', ...(s.kind === 'gate' ? ['tminus-gate'] : s.kind === 'pnr' ? ['tminus-pnr'] : [])],
            description: adf(`Synthetic demo step created by T-Minus. Workstream: ${s.workstream}. Planned duration: ${s.durationMin} min.`),
          },
        })),
      }),
    });
    if (!res.ok) return fail(res, 'Creating Jira issues');
    const created: any[] = (await res.json()).issues ?? [];
    const map: Record<string, string> = {};
    steps.forEach((s, i) => {
      if (created[i]?.key) map[s.id] = created[i].key;
    });

    const links = steps.flatMap((s) => s.deps.filter((d) => map[d] && map[s.id]).map((d) => ({ blocker: map[d], blocked: map[s.id] })));
    for (let i = 0; i < links.length; i += 5) {
      await Promise.all(
        links.slice(i, i + 5).map((l) =>
          api.asUser().requestJira(route`/rest/api/3/issueLink`, {
            method: 'POST',
            headers: json,
            // inwardIssue blocks outwardIssue.
            body: JSON.stringify({ type: { name: 'Blocks' }, inwardIssue: { key: l.blocker }, outwardIssue: { key: l.blocked } }),
          }),
        ),
      );
    }
    return map;
  },
};
