import { oauthProviderClient } from '@better-auth/oauth-provider/client';
import {
  onlineManager,
  partialMatchKey,
  type QueryClient,
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { redirect, useNavigate } from '@tanstack/react-router';
import { createAuthClient } from 'better-auth/react';
import type { InferResponseType } from 'hono/client';
import type { LoginInput } from '../../shared/validation/users.ts';
import { api } from './api.ts';

// ログイン状態に関わることはすべてこの file に置き、画面（routes）はここの関数を呼ぶだけにする。
// 判定・遷移・キャッシュの扱いが画面ごとに食い違わないようにするため。

/**
 * better-auth のクライアント。ログイン・ログアウト・OAuth の同意に使い、ログイン状態の参照は meQueryOptions で行う。
 * oauthProviderClient は、MCP クライアントの認可フローでログイン／同意画面に付く署名付きクエリを API 呼び出しに添える。
 */
const authClient = createAuthClient({
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
 * ルートの beforeLoad が使う、ログイン中のユーザー。未ログインなら null。
 * - オフラインではキャッシュだけを見る（TanStack Query はオフライン中の取得を一時停止するので、
 *   待つと完了しない）。オンラインかどうかは onlineManager だけで決める（`src/lib/online.ts`）
 * - キャッシュにユーザーがいればそれを信じて即起動する（期限切れはサーバーの 401 で検出する）
 * - キャッシュが空か「未ログイン」ならサーバーに聞く（ログイン直後は永続化が追いつかず、
 *   キャッシュが「未ログイン」のままのことがある）
 * - revalidate: キャッシュにユーザーがいてもサーバーに確かめる。ログイン画面が「済んでいるなら
 *   見せない」を判定するときに、期限の切れたキャッシュで誤ってアプリへ送り返さないため
 */
export async function resolveMe(
  client: QueryClient,
  { revalidate = false }: { revalidate?: boolean } = {},
): Promise<Me | null> {
  const cached = client.getQueryData(meQueryOptions.queryKey);
  if (!onlineManager.isOnline()) return cached ?? null;
  if (cached && !revalidate) return cached;
  return client.fetchQuery({ ...meQueryOptions, staleTime: 0 });
}

/**
 * ログイン必須の画面のガード（beforeLoad）。未ログインならログイン画面へ送り、済んだら href へ戻す。
 * UX のためだけの判定で、防御はサーバーの 401。
 */
export async function requireSignedIn(client: QueryClient, href: string): Promise<void> {
  if (!(await resolveMe(client))) throw redirect({ to: '/login', search: { redirect: href } });
}

/**
 * ログイン。成功したら戻り先（無ければホーム）へ移る。失敗は理由を持った Error で投げる
 * （フォームが `useFormSubmit` でその場に出す）。
 */
export function useLogin(redirectTo: string | undefined) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async ({ email, password }: LoginInput): Promise<void> => {
    const { data, error } = await authClient.signIn.email({ email, password });
    if (error) {
      throw new Error(
        error.status === 401
          ? 'メールアドレスまたはパスワードが違います'
          : (error.message ?? 'ログインに失敗しました'),
      );
    }
    // MCP クライアントの認可フロー中（署名付きクエリ付きでここに来た場合）は、
    // better-auth が同意画面またはクライアントへの戻り先 URL を返すのでそこへ移動する
    if (
      data &&
      'redirect' in data &&
      data.redirect &&
      'url' in data &&
      typeof data.url === 'string'
    ) {
      window.location.assign(data.url);
      return;
    }
    // ルートガードはキャッシュを見るので、遷移前にログイン後のユーザーを取り直しておく
    await queryClient.fetchQuery({ ...meQueryOptions, staleTime: 0 });
    await navigate({ to: redirectTo ?? '/' });
  };
}

/**
 * OAuth の同意（MCP クライアントの認可）への返事。受け付けられたら better-auth が返す URL
 * （クライアントへの戻り先）へ移る。同意の API 呼び出しには oauthProviderClient が
 * window.location.search（署名付きクエリ）を oauth_query として自動で添える。
 * WHY networkMode: 'always': オフラインで保留させない。保留した mutation は永続化され、
 * 送り方（関数）を持たないまま次の起動で復元されてしまう。オフラインならその場で失敗させる。
 */
export function useConsent() {
  return useMutation({
    networkMode: 'always',
    mutationFn: async (accept: boolean) => {
      const result = await authClient.oauth2.consent({ accept });
      if (result.error) throw new Error(result.error.message ?? '処理に失敗しました');
      window.location.assign(result.data.url);
    },
  });
}

/**
 * 未ログインになったことを手元に反映する（ログアウトと、API の 401 の両方がここを通る）。
 * me を「未ログイン」にし、端末に溜めた書き込み（オフラインの書き込みキュー）を捨てる。
 * WHY 書き込みを捨てる: 溜めた書き込みは送る時点のセッションで送られるので、残すと次に
 * ログインした別のユーザーとして送られてしまう。送り直しを待っている書き込みはここでは止められないので、
 * 送る試行のたびに書いた人を確かめて防ぐ（`lib/query-client.ts` の `sendAsAuthor`）。
 * WHY NOT 401 のときは残して同じユーザーの再ログインを待つ: 401 はオンラインでしか起きず、
 * オンラインでは溜めた書き込みはすぐ送られて同じ 401 で失敗する（送り直すのは通信断だけ）。
 * 残しても通る見込みが無い。
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
