import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_HUE } from '../../../../shared/color.ts';
import { app } from '../../../app.ts';
import { ConflictError } from '../../../lib/errors.ts';
import { truncateAll } from '../../../lib/test-db.ts';
import { createUser, listUsers, updateUser } from '../service.ts';

const alice = { email: 'alice@example.com', name: 'Alice', password: 'password-alice-1' };

async function login(email: string, password: string): Promise<Response> {
  return app.request('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

describe('users service', () => {
  beforeEach(truncateAll);

  it('ユーザーを作成して一覧に出る', async () => {
    const created = await createUser(alice);
    expect(created).toMatchObject({ name: 'Alice', email: 'alice@example.com' });
    expect(await listUsers()).toEqual([created]);
  });

  it('色相を省略すると既存ユーザーと離れた色相が割り当てられ、指定すればその値になる', async () => {
    const first = await createUser(alice);
    expect(first.hue).toBe(DEFAULT_HUE);
    const second = await createUser({
      email: 'bob@example.com',
      name: 'Bob',
      password: 'password-bob-12',
    });
    expect(Math.abs(second.hue - first.hue)).toBeGreaterThan(90);
    const third = await createUser({
      email: 'carol@example.com',
      name: 'Carol',
      password: 'password-carol-1',
      hue: 120,
    });
    expect(third.hue).toBe(120);
    expect((await updateUser(third.id, { hue: 10 })).hue).toBe(10);
  });

  it('同じメールアドレスは登録できない', async () => {
    await createUser(alice);
    await expect(createUser({ ...alice, name: 'Alice2' })).rejects.toBeInstanceOf(ConflictError);
  });

  it('作成したユーザーでログインできる', async () => {
    await createUser(alice);
    const res = await login(alice.email, alice.password);
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('better-auth.session_token');
  });

  it('名前とパスワードを変更できる', async () => {
    const created = await createUser(alice);
    const updated = await updateUser(created.id, { name: 'Alicia', password: 'new-password-123' });
    expect(updated.name).toBe('Alicia');
    expect((await login(alice.email, alice.password)).status).toBe(401);
    expect((await login(alice.email, 'new-password-123')).status).toBe(200);
  });
});

describe('パスワード変更による失効', () => {
  beforeEach(truncateAll);
  it('旧セッションをすべて拒否し、新パスワードでログインできる', async () => {
    const user = await createUser(alice);
    const first = await login(alice.email, alice.password);
    const second = await login(alice.email, alice.password);
    const cookies = [first, second].map((res) =>
      res.headers
        .getSetCookie()
        .map((cookie) => cookie.split(';')[0])
        .join('; '),
    );
    for (const cookie of cookies)
      expect((await app.request('/api/me', { headers: { cookie } })).status).toBe(200);
    await updateUser(user.id, { password: 'replacement-password-123' });
    for (const cookie of cookies)
      expect((await app.request('/api/me', { headers: { cookie } })).status).toBe(401);
    expect((await login(alice.email, 'replacement-password-123')).status).toBe(200);
  });
});
