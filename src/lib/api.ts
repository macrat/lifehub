import { withActiveSpan } from '@sentry/react';
import { createTRPCClient, createTRPCUntypedClient, httpBatchLink } from '@trpc/client';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../server/app.ts';

/** API が 401 を返したときに発火する。main.tsx がこれを受けてログイン画面へ遷移する。 */
export const UNAUTHORIZED_EVENT = 'lifehub:unauthorized';

/**
 * 通信そのものが届かなかった失敗（オフライン・回線の切断）。サーバーが理由を返した失敗と区別する。
 * 送り直せば通る見込みがあるので、書き込みはこれだけを送り直す（`lib/query-client.ts`）。
 */
class NetworkError extends Error {}

/** ログインしていない（API が 401 を返した）。ログイン画面へ送るのは `UNAUTHORIZED_EVENT` が受け持つ */
class UnauthorizedError extends Error {}

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

/** fetch に通信断の判別と 401 の検知を足したもの。失敗はそれぞれの Error として投げる */
async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await apiRequestFetch(input, init);
  } catch (cause) {
    throw new NetworkError('通信できませんでした', { cause });
  }
  if (res.status === 401) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new UnauthorizedError('ログインが必要です');
  }
  return res;
}

/**
 * 画面の API（tRPC。`server/lib/trpc.ts`）へ送る口。同じ時点に出た呼び出しを 1 本の要求にまとめる
 * （読み出しは GET、書き込みは POST）。`apiFetch` が投げた失敗は、呼び出し側には `cause` に入って届く
 * （`isNetworkError`・`isUnauthorized`）。
 */
const links = [httpBatchLink({ url: '/api/trpc', fetch: apiFetch, maxURLLength: 8000 })];

/** 画面の API のクライアント。サーバーの AppRouter を型としてだけ参照し、実行時コードは含まない */
export const api = createTRPCClient<AppRouter>({ links });

/** 画面の API の手続きの入力・出力の型（`ApiOutputs['me']['get']` のように引く） */
export type ApiInputs = inferRouterInputs<AppRouter>;
export type ApiOutputs = inferRouterOutputs<AppRouter>;

/** 失敗が通信断によるものか */
export function isNetworkError(error: unknown): boolean {
  return error instanceof Error && error.cause instanceof NetworkError;
}

/** 失敗がログインしていないことによるものか */
export function isUnauthorized(error: unknown): boolean {
  return error instanceof Error && error.cause instanceof UnauthorizedError;
}

type Procedures = AppRouter['_def']['record'];

/** 書き込み 1 回分。端末に溜めて後から送れるよう、手続きの名前（`memos.create` など）と入力だけを持つプレーンな値にする。 */
export type WriteRequest = { path: string; input: unknown };

/** 書き込みの手続きごとの、入力から送る内容を作る関数（`write.memos.create(input)`） */
type WriteBuilders = {
  [R in keyof Procedures & keyof ApiInputs]: {
    [K in keyof Procedures[R] & keyof ApiInputs[R] as Procedures[R][K] extends {
      _def: { type: 'mutation' };
    }
      ? K
      : never]: (input: ApiInputs[R][K]) => WriteRequest;
  };
};

/**
 * 書き込みの送る内容を作る（`useOptimisticMutation` の `request: write.memos.create`）。
 * 型は API の手続きから導き、実体は名前を `path` にするだけ。
 * WHY NOT tRPC のクライアントで送る関数をそのまま渡す: 送る内容は端末に溜めて後から（次の起動で）送るので、
 * 関数ではなく値で持つ必要がある（`lib/query-client.ts` の `Write`）
 */
export const write = new Proxy({} as WriteBuilders, {
  get: (_, router: string) =>
    new Proxy(
      {},
      {
        get:
          (_, procedure: string) =>
          (input: unknown): WriteRequest => ({ path: `${router}.${procedure}`, input }),
      },
    ),
});

/** 名前で手続きを呼ぶクライアント（端末に溜めた書き込みは、手続きの名前と入力だけを持つ） */
const untypedApi = createTRPCUntypedClient<AppRouter>({ links });

/** 書き込みを送る。失敗はサーバーのメッセージを含む Error（通信断なら `isNetworkError`）になる。 */
export async function sendWrite({ path, input }: WriteRequest): Promise<void> {
  await untypedApi.mutation(path, input);
}
