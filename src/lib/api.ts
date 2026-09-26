import { type ClientResponse, hc } from 'hono/client';
import type { AppType } from '../../server/app.ts';

/** API が 401 を返したときに発火する。main.tsx がこれを受けてログイン画面へ遷移する。 */
export const UNAUTHORIZED_EVENT = 'lifehub:unauthorized';

/**
 * 通信そのものが届かなかった失敗（オフライン・回線の切断）。サーバーが理由を返した失敗と区別する。
 * 送り直せば通る見込みがあるので、書き込みはこれだけを送り直す（`lib/query-client.ts`）。
 */
export class NetworkError extends Error {}

/** fetch に 401 の検知と通信断の判別を足したもの。RPC クライアントと書き込みの送信が共有する。 */
async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (cause) {
    throw new NetworkError('通信できませんでした', { cause });
  }
  if (res.status === 401) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
  return res;
}

/**
 * Hono RPC クライアント。サーバーの AppType を型としてだけ参照し、実行時コードは含まない。
 * 同一オリジンだが、`$url()` が URL を組み立てられるよう baseUrl に自分のオリジンを渡す。
 */
export const api = hc<AppType>(location.origin, { fetch: apiFetch }).api;

/** 書き込み 1 回分。端末に溜めて後から送れるよう、送る内容だけを持つプレーンな値にする。 */
export type WriteRequest = {
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** 同一オリジンのパス。`api.events[':id'].$url({ param }).pathname` のように組み立てる */
  path: string;
  body?: unknown;
};

/** 書き込みを送る。失敗はサーバーのメッセージを含む Error（通信断なら NetworkError）になる。 */
export async function sendWrite({ method, path, body }: WriteRequest): Promise<void> {
  const res = await apiFetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw await errorOf(res);
}

/** 成功（2xx）のレスポンス型だけを残す（Hono の FilterClientResponseByStatusCode 相当。同型は export されていない） */
type OkResponse<R> =
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
  throw await errorOf(res as unknown as Response);
}

/** 失敗したレスポンスから、サーバーのメッセージを取り出した Error を作る。 */
async function errorOf(res: Response): Promise<Error> {
  let message = `リクエストに失敗しました（${res.status}）`;
  try {
    const body = (await res.json()) as { message?: string };
    if (body.message) message = body.message;
  } catch {
    // JSON でない本文は無視する
  }
  return new Error(message);
}
