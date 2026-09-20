import { beforeEach, describe, expect, it } from 'vitest';
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
