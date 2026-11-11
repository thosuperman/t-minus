import { invoke, view } from '@forge/bridge';
import type { ApiResult } from '../../src/core/api';

export class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const DEV = import.meta.env.DEV;
export const devUser = DEV ? new URLSearchParams(location.search).get('user') ?? 'lena' : undefined;

async function raw(fn: string, payload: unknown): Promise<ApiResult> {
  if (DEV) {
    const res = await fetch('/__dev/invoke', { method: 'POST', body: JSON.stringify({ fn, payload, user: devUser }) });
    return res.json();
  }
  return (await invoke('api', { fn, payload })) as ApiResult;
}

export async function call<T>(fn: string, payload: Record<string, unknown> = {}): Promise<T> {
  let out: ApiResult;
  try {
    out = await raw(fn, payload);
  } catch (e) {
    throw new ApiError('NETWORK', `Could not reach T-Minus (${(e as Error).message}). Your last action may not have been recorded.`);
  }
  if (!out.ok) throw new ApiError(out.code, out.message);
  return out.data as T;
}

export interface HostContext {
  projectKey?: string;
  accountId?: string;
}

export async function hostContext(): Promise<HostContext> {
  if (DEV) return { projectKey: 'CUT', accountId: devUser };
  try {
    view.theme.enable().catch(() => undefined);
    const ctx = (await view.getContext()) as any;
    return { projectKey: ctx?.extension?.project?.key, accountId: ctx?.accountId };
  } catch {
    return {};
  }
}
