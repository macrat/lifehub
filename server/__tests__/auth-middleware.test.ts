import type { Pool } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../app.ts';
import { getAuth } from '../lib/auth.ts';
import { db } from '../lib/db/client.ts';
import { clearTables } from '../lib/db/test-db.ts';
import { apiClient, loginAs } from './login.ts';

describe('認証ミドルウェア', () => {
  beforeEach(clearTables);

  it('未認証の API アクセスは 401', async () => {
    const res = await app.request('/api/trpc/me.get');
    expect(res.status).toBe(401);
  });

  it('公開のサインアップ経路は閉じている', async () => {
    const res = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'x@example.com', name: 'x', password: 'password-123456' }),
    });
    expect(res.status).toBe(404);
  });

  it('ログイン後の Cookie で API にアクセスできる', async () => {
    const { cookie } = await loginAs('A');
    expect(await apiClient(cookie).me.get.query()).toMatchObject({
      name: 'A',
      email: 'a@example.com',
    });
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
    expect(await res.text()).toBe('ログインが必要です');
  });

  it('未認証の書き込みは、ハンドラを走らせずに 401', async () => {
    const res = await app.request('/api/trpc/memos.create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: '01a0eb14-0000-7000-8000-000000000000', body: 'x' }),
    });
    expect(res.status).toBe(401);
    const { cookie } = await loginAs('A');
    expect((await apiClient(cookie).timeline.get.query({})).items).toEqual([]);
  });
});
