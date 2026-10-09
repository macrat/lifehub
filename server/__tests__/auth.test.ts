import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../app.ts';
import { memos } from '../features/memos/schema.ts';
import { rateLimits } from '../features/users/schema.ts';
import { getAuth } from '../lib/auth.ts';
import { db } from '../lib/db/client.ts';
import { clearTables } from '../lib/db/test-db.ts';
import { loginAs } from './login.ts';
import { recordStatements } from './statements.ts';

describe('ログインと認証の口', () => {
  beforeEach(clearTables);
  afterEach(() => vi.restoreAllMocks());

  it('公開のサインアップ経路は閉じている', async () => {
    const res = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'x@example.com', name: 'x', password: 'password-123456' }),
    });
    expect(res.status).toBe(404);
  });

  it('セッションの確認は、セッションとユーザーを 1 回の問い合わせで読む', async () => {
    const { cookie, userId } = await loginAs('A');
    const auth = await getAuth();
    const statements = recordStatements();
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user.id).toBe(userId);
    expect(statements).toHaveLength(1);
  });

  it('未認証の読み出しは、ハンドラを走らせずに 401', async () => {
    const statements = recordStatements();
    const input = encodeURIComponent(JSON.stringify({ from: '2020-01-01', to: '2020-01-31' }));
    const res = await app.request(`/api/trpc/calendar.get?input=${input}`, {
      headers: { cookie: 'better-auth.session_token=forged' },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ error: { message: 'ログインが必要です' } });
    expect(body).not.toHaveProperty('result');
    // 応答の後に裏で走り出す処理も無い（セッションの検証のほかに、DB へ何も問い合わせない）
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(statements.filter((text) => !/"sessions"/.test(text))).toEqual([]);
  });

  it('未認証の書き込みは、ハンドラを走らせずに 401', async () => {
    const res = await app.request('/api/trpc/memos.create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: '01a0eb14-0000-7000-8000-000000000000', body: 'x' }),
    });
    expect(res.status).toBe(401);
    expect(await db.select().from(memos)).toEqual([]);
  });

  it('未認証で無い手続きを呼ぶと 404 で、ログインの検証の失敗を取りこぼさない', async () => {
    const rejected = vi.fn();
    process.on('unhandledRejection', rejected);
    try {
      const res = await app.request('/api/trpc/nothing.here');
      expect(res.status).toBe(404);
      // 取りこぼした reject は、マイクロタスクが尽きた後に unhandledRejection として出る
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(rejected).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', rejected);
    }
  });

  describe('ログインのレート制限', () => {
    /** 形の正しくないメールで試す。数えはパスワードの検証より前なので、scrypt を待たずに済む */
    const signInFrom = (ip: string) =>
      app.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
        body: JSON.stringify({ email: 'nobody', password: 'password' }),
      });

    /** レート制限は本番ビルドでだけ有効なので、このテストの間だけ有効にする */
    beforeEach(async () => {
      const context = await (await getAuth()).$context;
      context.rateLimit.enabled = true;
      return () => {
        context.rateLimit.enabled = false;
      };
    });

    it('IP ごとに 15 分で 10 回まで試せて、数えは DB に残る', async () => {
      for (let i = 0; i < 10; i++) expect((await signInFrom('203.0.113.1')).status).toBe(400);
      expect((await signInFrom('203.0.113.1')).status).toBe(429);
      expect((await signInFrom('203.0.113.2')).status).toBe(400);
      // インスタンスのメモリではなく DB で数える（どのインスタンスに届いても同じ数えを使う）
      expect(
        await db.select({ key: rateLimits.key, count: rateLimits.count }).from(rateLimits),
      ).toEqual(
        expect.arrayContaining([
          { key: '203.0.113.1|/sign-in/email', count: 10 },
          { key: '203.0.113.2|/sign-in/email', count: 1 },
        ]),
      );
    });
  });
});
