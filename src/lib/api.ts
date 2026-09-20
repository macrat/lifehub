import { hc } from 'hono/client';
import type { AppType } from '../../server/app.ts';

/** API が 401 を返したときに発火する。main.tsx がこれを受けてログイン画面へ遷移する。 */
export const UNAUTHORIZED_EVENT = 'lifehub:unauthorized';

/**
 * Hono RPC クライアント。サーバーの AppType を型としてだけ参照し、実行時コードは含まない。
 * 同一オリジンなので baseUrl は空。
 */
export const api = hc<AppType>('', {
  fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await fetch(input, init);
    if (res.status === 401) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    return res;
  },
}).api;

/** レスポンスが成功でなければ、サーバーのメッセージを含む Error を投げる */
export async function ensureOk<T extends Response>(res: T): Promise<T> {
  if (res.ok) return res;
  let message = `リクエストに失敗しました（${res.status}）`;
  try {
    const body = (await res.json()) as { message?: string };
    if (body.message) message = body.message;
  } catch {
    // JSON でない本文は無視する
  }
  throw new Error(message);
}
