import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../app.ts';
import { memos } from '../features/memos/schema.ts';
import { rateLimits } from '../features/users/schema.ts';
import { getAuth } from '../lib/auth.ts';
import { db } from '../lib/db/client.ts';
import { clearTables } from '../lib/db/test-db.ts';
import { appWith } from './app-with.ts';
import { loginAs, signIn } from './login.ts';
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
    /** レート制限は本番ビルドでだけ掛かるので、本番の設定でアプリを作り直す */
    const productionApp = appWith({ NODE_ENV: 'production' });

    /** 形の正しくないメールで試す（WHY は auth-origin.test.ts の `status`） */
    const signInFrom = (ip: string) =>
      signIn('nobody', 'password', { app: productionApp(), headers: { 'x-forwarded-for': ip } });
    const counts = () =>
      db
        .select({ key: rateLimits.key, count: rateLimits.count })
        .from(rateLimits)
        .orderBy(rateLimits.key);

    it('ログインだけを IP ごとに 15 分で 10 回まで試せる', async () => {
      for (let i = 0; i < 10; i++) expect((await signInFrom('203.0.113.1')).status).toBe(400);
      const blocked = await signInFrom('203.0.113.1');
      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers.get('x-retry-after'))).toBeGreaterThan(0);
      expect((await signInFrom('203.0.113.2')).status).toBe(400);
      // ログイン以外の口は数えない
      await productionApp().request('/api/auth/ok', {
        headers: { 'x-forwarded-for': '203.0.113.1' },
      });
      expect(await counts()).toEqual([
        { key: '203.0.113.1|/sign-in/email', count: 11 },
        { key: '203.0.113.2|/sign-in/email', count: 1 },
      ]);
    });

    it('数えは 1 回の問い合わせで済み、窓を過ぎたら数え直して、期限を過ぎたほかの行を消す', async () => {
      await signInFrom('203.0.113.1');
      await signInFrom('203.0.113.2');
      await db.update(rateLimits).set({ resetAt: new Date(Date.now() - 1000) });
      const statements = recordStatements();
      expect((await signInFrom('203.0.113.1')).status).toBe(400);
      const counted = statements.filter((text) => /"rate_limits"/.test(text));
      expect(counted).toHaveLength(1);
      expect(await counts()).toEqual([{ key: '203.0.113.1|/sign-in/email', count: 1 }]);
    });
  });
});
