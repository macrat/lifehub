import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_HUE } from '../../../../shared/color.ts';
import { newId } from '../../../../shared/id.ts';
import { createUserSchema } from '../../../../shared/validation/users.ts';
import { cookieOf, signIn as login } from '../../../__tests__/login.ts';
import { app } from '../../../app.ts';
import { clearTables, createTestUser } from '../../../lib/db/test-db.ts';
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

  it('同じメールアドレスは、大文字と小文字の違いだけでも登録できない', async () => {
    await createUser(alice);
    await expect(createUser({ ...alice, name: 'Alice2' })).rejects.toBeInstanceOf(ConflictError);
    // 作る経路（画面の API・scripts/create-user.ts）は入力をスキーマで読む
    await expect(
      createUser(createUserSchema.parse({ ...alice, email: 'Alice@Example.com', name: 'Alice3' })),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('作成したユーザーでログインでき、パスワードを変えるとプロフィールはそのままで、旧セッションと旧パスワードを拒否する', async () => {
    const created = await createUser(alice);
    const sessions = [
      await login(alice.email, alice.password),
      await login(alice.email, alice.password),
    ];
    const cookies = sessions.map(cookieOf);
    for (const cookie of cookies)
      expect((await app.request('/api/trpc/me.get', { headers: { cookie } })).status).toBe(200);

    await updateUser(created.id, { password: 'new-password-123' }, created.id);
    expect(await listUsers()).toEqual([created]);
    for (const cookie of cookies)
      expect((await app.request('/api/trpc/me.get', { headers: { cookie } })).status).toBe(401);
    expect((await login(alice.email, alice.password)).status).toBe(401);
    expect((await login(alice.email, 'new-password-123')).status).toBe(200);
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
    const other = await createTestUser('B');
    await updateUser(created.id, { name: 'Alicia' }, other);
    await expect(
      updateUser(created.id, { name: 'Mallory', password: 'stolen-password-1' }, other),
    ).rejects.toBeInstanceOf(ForbiddenError);
    // 拒否したときはプロフィールも変えない
    expect((await listUsers()).find((u) => u.id === created.id)?.name).toBe('Alicia');
    expect((await login(alice.email, alice.password)).status).toBe(200);
  });
});
