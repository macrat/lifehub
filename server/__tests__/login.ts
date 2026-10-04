import { createTRPCClient, httpBatchLink, httpLink } from '@trpc/client';
import { type AppRouter, app } from '../app.ts';
import { createTestUser, TEST_PASSWORD, testEmail } from '../lib/db/test-db.ts';

/** サーバーのテストで、ログインして Cookie を得るための共通の手順 */

/** メールとパスワードでログインする。失敗（401）を確かめるテストのため、応答をそのまま返す */
export async function signIn(email: string, password: string): Promise<Response> {
  return await app.request('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

/** ログインの応答から、次の要求に載せる Cookie ヘッダーの値を作る（属性を落として 名前=値 だけをつなぐ） */
export function cookieOf(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
}

/** テスト用のユーザー（`createTestUser`）を作ってログインし、ID と Cookie を返す */
export async function loginAs(name: 'A' | 'B'): Promise<{ userId: string; cookie: string }> {
  const userId = await createTestUser(name);
  return { userId, cookie: cookieOf(await signIn(testEmail(name), TEST_PASSWORD)) };
}

/**
 * 画面の API（tRPC）のクライアント。要求はネットワークを通さずアプリへそのまま渡す。
 * cookie を省くとログインしていない要求になる
 */
export function apiClient(cookie?: string) {
  return createTRPCClient<AppRouter>({ links: [httpLink(linkOptions(cookie))] });
}

/** テスト用のクライアントの送り先（ネットワークを通さずアプリへ渡す）と Cookie */
function linkOptions(cookie?: string) {
  return {
    url: 'http://localhost/api/trpc',
    fetch: async (url: string, init?: unknown) => app.request(String(url), init as RequestInit),
    headers: cookie ? { cookie } : {},
  };
}

/**
 * 画面と同じく、同じ時点の呼び出しを 1 本の要求にまとめるクライアント（`src/lib/api.ts` の `httpBatchLink`）。
 * 1 本の要求に載った手続きの間で読み取りがまとまるかを確かめるのに使う
 */
export function batchedApiClient(cookie: string) {
  return createTRPCClient<AppRouter>({ links: [httpBatchLink(linkOptions(cookie))] });
}
