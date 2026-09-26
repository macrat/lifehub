import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_HUE } from '../../../../shared/color.ts';
import { newId } from '../../../../shared/id.ts';
import { cookieOf, signIn as login } from '../../../__tests__/login.ts';
import { app } from '../../../app.ts';
import { clearTables } from '../../../lib/db/test-db.ts';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../lib/errors.ts';
import { createUser, listUsers, updateUser } from '../service.ts';

const alice = { email: 'alice@example.com', name: 'Alice', password: 'password-alice-1' };

describe('users service', () => {
  beforeEach(clearTables);

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
    await updateUser(third.id, { hue: 10 }, third.id);
    expect((await listUsers()).find((u) => u.id === third.id)?.hue).toBe(10);
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
    await updateUser(created.id, { name: 'Alicia', password: 'new-password-123' }, created.id);
    expect((await listUsers()).find((u) => u.id === created.id)?.name).toBe('Alicia');
    expect((await login(alice.email, alice.password)).status).toBe(401);
    expect((await login(alice.email, 'new-password-123')).status).toBe(200);
  });

  it('パスワードだけの変更ではプロフィールは変わらない', async () => {
    const created = await createUser(alice);
    await updateUser(created.id, { password: 'new-password-123' }, created.id);
    expect(await listUsers()).toEqual([created]);
  });

  it('いないユーザーは変更できない', async () => {
    const id = newId();
    await expect(updateUser(id, { name: 'だれか' }, id)).rejects.toThrow(NotFoundError);
    await expect(updateUser(id, { password: 'new-password-123' }, id)).rejects.toThrow(
      NotFoundError,
    );
  });

  it('他のユーザーのプロフィールは変更できるが、パスワードは変更できない', async () => {
    const created = await createUser(alice);
    const other = await createUser({
      email: 'bob@example.com',
      name: 'Bob',
      password: 'password-bob-12',
    });
    await updateUser(created.id, { name: 'Alicia' }, other.id);
    await expect(
      updateUser(created.id, { name: 'Mallory', password: 'stolen-password-1' }, other.id),
    ).rejects.toBeInstanceOf(ForbiddenError);
    // 拒否したときはプロフィールも変えない
    expect((await listUsers()).find((u) => u.id === created.id)?.name).toBe('Alicia');
    expect((await login(alice.email, alice.password)).status).toBe(200);
  });
});

describe('パスワード変更による失効', () => {
  beforeEach(clearTables);
  it('旧セッションをすべて拒否し、新パスワードでログインできる', async () => {
    const user = await createUser(alice);
    const first = await login(alice.email, alice.password);
    const second = await login(alice.email, alice.password);
    const cookies = [first, second].map(cookieOf);
    for (const cookie of cookies)
      expect((await app.request('/api/me', { headers: { cookie } })).status).toBe(200);
    await updateUser(user.id, { password: 'replacement-password-123' }, user.id);
    for (const cookie of cookies)
      expect((await app.request('/api/me', { headers: { cookie } })).status).toBe(401);
    expect((await login(alice.email, 'replacement-password-123')).status).toBe(200);
  });
});
