import { beforeEach, describe, expect, it } from 'vitest';
import { dateStringSchema } from '../../shared/validation/common.ts';
import { app } from '../app.ts';
import { addExpense } from '../features/expenses/service.ts';
import { createUser, updateUser } from '../features/users/service.ts';
import { truncateAll } from '../lib/test-db.ts';

/**
 * 変わっていない応答を再送しないこと（ETag と条件付き要求）。
 * 既定の staleTime は 0 で画面を開くたびに取り直すので、ここが効かないと一覧を毎回丸ごと転送する。
 */
describe('条件付き要求', () => {
  let cookie: string;
  let userId: string;

  beforeEach(async () => {
    await truncateAll();
    userId = (await createUser({ email: 'a@example.com', name: 'A', password: 'password-123456' }))
      .id;
    const login = await app.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@example.com', password: 'password-123456' }),
    });
    cookie = login.headers.get('set-cookie') ?? '';
  });

  const get = (path: string, etag?: string) =>
    app.request(path, {
      headers: { cookie, ...(etag ? { 'if-none-match': etag } : {}) },
    });

  it('内容が同じなら 304 を返し、本文を送らない', async () => {
    const first = await get('/api/expenses');
    expect(first.status).toBe(200);
    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();
    expect(first.headers.get('cache-control')).toBe('private, no-cache');

    const second = await get('/api/expenses', etag ?? '');
    expect(second.status).toBe(304);
    expect(await second.text()).toBe('');
  });

  it('内容が変わったら 200 で新しい本文を返す', async () => {
    const etag = (await get('/api/expenses')).headers.get('etag') ?? '';
    await addExpense(
      {
        fromUserId: userId,
        toUserId: null,
        amount: 1200,
        description: '牛乳',
        spentOn: dateStringSchema.parse('2026-09-14'),
      },
      userId,
    );
    const res = await get('/api/expenses', etag);
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(1);
  });

  it('/me は色の変更に追従する（セッションから返しても古くならない）', async () => {
    expect(await (await get('/api/me')).json()).toMatchObject({ name: 'A', hue: 335 });
    await updateUser(userId, { hue: 120 });
    expect(await (await get('/api/me')).json()).toMatchObject({ hue: 120 });
  });
});
