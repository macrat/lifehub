import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../app.ts';
import { clearTables } from '../lib/db/test-db.ts';
import { loginAs } from './login.ts';

describe('認証ミドルウェア', () => {
  beforeEach(clearTables);

  it('未認証の API アクセスは 401', async () => {
    const res = await app.request('/api/me');
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
    const res = await app.request('/api/me', { headers: { cookie } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: 'A', email: 'a@example.com' });
  });
});
