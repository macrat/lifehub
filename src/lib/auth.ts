import { oauthProviderClient } from '@better-auth/oauth-provider/client';
import {
  partialMatchKey,
  type QueryClient,
  queryOptions,
  useQueryClient,
} from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { createAuthClient } from 'better-auth/react';
import type { InferResponseType } from 'hono/client';
import { api } from './api.ts';

/**
 * better-auth のクライアント。ログイン・ログアウト・OAuth の同意に使い、ログイン状態の参照は meQueryOptions で行う。
 * oauthProviderClient は、MCP クライアントの認可フローでログイン／同意画面に付く署名付きクエリを API 呼び出しに添える。
 */
export const authClient = createAuthClient({
  basePath: '/api/auth',
  plugins: [oauthProviderClient()],
});

/** ログイン中のユーザー。形は API（`/api/me`、サーバーの `toMe`）が決める */
export type Me = InferResponseType<typeof api.me.$get, 200>;

/**
 * ログイン中のユーザー。未認証なら null。
 * TanStack Query に載せることで永続化キャッシュの対象になり、オフライン起動時も前回のユーザーで描画できる。
 */
export const meQueryOptions = queryOptions({
  queryKey: ['me'],
  queryFn: async (): Promise<Me | null> => {
    const res = await api.me.$get();
    if (res.status === 401) return null;
    if (!res.ok) throw new Error('ユーザー情報の取得に失敗しました');
    return res.json();
  },
  staleTime: 1000 * 60 * 5,
});

/**
 * 未ログインになったことを手元に反映する（ログアウトと、API の 401 の両方がここを通る）。
 * me を「未ログイン」にし、端末に溜めた書き込み（オフラインの書き込みキュー）を捨てる。
 * WHY 書き込みを捨てる: 溜めた書き込みは送る時点のセッションで送られるので、残すと次に
 * ログインした別のユーザーとして送られてしまう。
 * WHY NOT 401 のときは残して同じユーザーの再ログインを待つ: 401 はオンラインでしか起きず、
 * オンラインでは溜めた書き込みはすぐ送られて同じ 401 で失敗する（送り直すのは通信断だけ）。
 * 残しても通る見込みは無く、誰のものかを覚えて待つ仕組みを足すほどの得も無い。
 * クエリのキャッシュはここでは消さない。401 を受けた画面はまだ表示中で、消すと表示中のクエリが
 * 取り直しに走るため（消すのは画面を離れるログアウトだけ。`useLogout`）。
 */
export function markSignedOut(client: QueryClient): void {
  client.setQueryData(meQueryOptions.queryKey, null);
  client.getMutationCache().clear();
}

/**
 * ログアウト。キャッシュを捨ててログイン画面へ送る（me だけは「未ログイン」として残し、
 * 次回起動で即ログイン画面に出す）。
 */
export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    await authClient.signOut();
    markSignedOut(queryClient);
    queryClient.removeQueries({
      predicate: (q) => !partialMatchKey(q.queryKey, meQueryOptions.queryKey),
    });
    await navigate({ to: '/login' });
  };
}
