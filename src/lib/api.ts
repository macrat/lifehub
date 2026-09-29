import { withActiveSpan } from '@sentry/react';
import { type ClientResponse, hc } from 'hono/client';
import type { AppType } from '../../server/app.ts';
import { createGetBatcher } from './batch-get.ts';

/** API が 401 を返したときに発火する。main.tsx がこれを受けてログイン画面へ遷移する。 */
export const UNAUTHORIZED_EVENT = 'lifehub:unauthorized';

/**
 * 通信そのものが届かなかった失敗（オフライン・回線の切断）。サーバーが理由を返した失敗と区別する。
 * 送り直せば通る見込みがあるので、書き込みはこれだけを送り直す（`lib/query-client.ts`）。
 */
export class NetworkError extends Error {}

/**
 * API への fetch。Sentry のトレースで、要求 1 つを画面の移動（navigation）のスパンの子にせず、それだけで
 * 1 つのスパンにする。トレース ID は同じなので、画面の移動とサーバーのスパンとは 1 本のトレースに並ぶ。
 * API への要求はすべてこれを通す（素の fetch は lint の `noRestrictedGlobals` が止める）。
 *
 * 画面の移動のスパンは、終わる前に次の移動が始まると打ち切られ、そのとき応答を待っている子のスパンを
 * 最後に終わった子の時刻で閉じる（@sentry/core の idle span）。取得中に次の画面へ移ると、要求の所要時間が
 * 実際より短く記録されてしまう。
 * WHY NOT 画面の移動のスパンが取得を待つ形のまま計る: 画面は端末に残したキャッシュですぐに描かれ、取得は
 * 裏で差し替えるだけなので、移動のスパンに取得を含めても画面が出るまでの時間にはならない。
 */
export const apiRequestFetch: typeof fetch = (input, init) =>
  withActiveSpan(null, () => fetch(input, init));

/** 同じ時点に出た API の GET を 1 本にまとめて送る（`lib/batch-get.ts`） */
const batchedGet = createGetBatcher(apiRequestFetch);

/** まとめて送れる要求なら、同じオリジンの API のパス（クエリ付き）。GET だけをまとめる */
function batchablePath(input: RequestInfo | URL, init?: RequestInit): string | null {
  if ((init?.method ?? 'GET') !== 'GET' || input instanceof Request) return null;
  const url = new URL(input, location.origin);
  if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return null;
  return `${url.pathname}${url.search}`;
}

/**
 * fetch に 401 の検知と通信断の判別を足したもの。RPC クライアントと書き込みの送信が共有する。
 * GET は同じ時点に出たものをまとめて送る（`batchedGet`）。
 */
async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    const path = batchablePath(input, init);
    res = await (path ? batchedGet(path, init) : apiRequestFetch(input, init));
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

/** 一覧の口（`api.memos` など）。作成はここへ送る */
type CollectionRoute = { $url: () => URL };
/** 1 件の口（`api.memos[':id']` など） */
type ItemRoute = { $url: (args: { param: { id: string } }) => URL };

/** 作成（POST）の送る内容。入力（クライアントが決めた id を含む）をそのまま本文にする */
export function createRequest<T>(route: CollectionRoute): (input: T) => WriteRequest {
  return (input) => ({ method: 'POST', path: route.$url().pathname, body: input });
}

/**
 * 1 件への書き込み（置き換え・部分更新・回を指す削除）の送る内容。id を URL に、残りを本文にする。
 */
export function itemRequest<T extends { id: string }>(
  method: 'PUT' | 'PATCH' | 'DELETE',
  route: ItemRoute,
): (input: T) => WriteRequest {
  return ({ id, ...body }) => ({ method, path: route.$url({ param: { id } }).pathname, body });
}

/** 1 件の削除（本文なし）の送る内容 */
export function deleteRequest(route: ItemRoute): (id: string) => WriteRequest {
  return (id) => ({ method: 'DELETE', path: route.$url({ param: { id } }).pathname });
}

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
