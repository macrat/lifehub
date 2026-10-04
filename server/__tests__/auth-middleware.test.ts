import type { Pool } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../app.ts';
import { memos } from '../features/memos/schema.ts';
import { getAuth } from '../lib/auth.ts';
import { db } from '../lib/db/client.ts';
import { clearTables } from '../lib/db/test-db.ts';
import { loginAs } from './login.ts';

describe('認証ミドルウェア', () => {
  beforeEach(clearTables);

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
    const query = vi.spyOn((db as unknown as { $client: Pool }).$client, 'query');
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user.id).toBe(userId);
    expect(query).toHaveBeenCalledTimes(1);
    query.mockRestore();
  });

  it('未認証の読み出しは、ハンドラを走らせても中身を返さず 401', async () => {
    const res = await app.request('/api/trpc/lemon.status');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ error: { message: 'ログインが必要です' } });
    expect(body).not.toHaveProperty('result');
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
});
