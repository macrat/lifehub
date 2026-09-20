import { type ClientResponse, hc } from 'hono/client';
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

/** 成功（2xx）のレスポンス型だけを残す（Hono の FilterClientResponseByStatusCode 相当。同型は export されていない） */
export type OkResponse<R> =
  R extends ClientResponse<infer T, infer S, infer F>
    ? S extends 200 | 201 | 204
      ? ClientResponse<T, S, F>
      : never
    : never;

/** レスポンスが成功でなければ、サーバーのメッセージを含む Error を投げる。型は成功時のものに絞られる。 */
export async function ensureOk<R extends ClientResponse<unknown, number, string>>(
  res: R,
): Promise<OkResponse<R>> {
  if (res.ok) return res as unknown as OkResponse<R>;
  let message = `リクエストに失敗しました（${res.status}）`;
  try {
    const body = (await res.json()) as { message?: string };
    if (body.message) message = body.message;
  } catch {
    // JSON でない本文は無視する
  }
  throw new Error(message);
}
