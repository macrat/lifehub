import { createTRPCClient, httpLink } from '@trpc/client';
import { makeSignature } from 'better-auth/crypto';
import { type AppRouter, app } from '../app.ts';
import { getAuth } from '../lib/auth.ts';
import { createTestUser } from '../lib/db/test-db.ts';

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

/**
 * テスト用のユーザー（`createTestUser`）を作ってログインし、ID と Cookie を返す。
 * セッションは better-auth の内部の口で直に作り、ログインの応答と同じ署名付きの Cookie にする
 * （better-auth の test-utils プラグインと同じ手順）。
 * WHY パスワードでログインしない: パスワードの検証（scrypt）は 1 回 100ms ほどかかり、ログインした
 * 要求を確かめるテストの準備のたびに払うことになる。パスワードでのログインそのもの（`signIn`）は
 * users service のテストが確かめる。
 */
export async function loginAs(name: 'A' | 'B'): Promise<{ userId: string; cookie: string }> {
  const userId = await createTestUser(name);
  const context = await (await getAuth()).$context;
  const { token } = await context.internalAdapter.createSession(userId);
  const signed = `${token}.${await makeSignature(token, context.secret)}`;
  return { userId, cookie: `${context.authCookies.sessionToken.name}=${signed}` };
}

/**
 * 画面の API（tRPC）のクライアント。要求はネットワークを通さずアプリへそのまま渡す。
 * cookie を省くとログインしていない要求になる
 */
export function apiClient(cookie?: string) {
  return createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: 'http://localhost/api/trpc',
        fetch: async (url, init) => app.request(String(url), init as RequestInit),
        headers: cookie ? { cookie } : {},
      }),
    ],
  });
}
