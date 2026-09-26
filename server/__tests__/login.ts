import { app } from '../app.ts';
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
