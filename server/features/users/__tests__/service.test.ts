import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_HUE } from '../../../../shared/color.ts';
import { newId } from '../../../../shared/id.ts';
import { createUserSchema, updateUserSchema } from '../../../../shared/validation/users.ts';
import { cookieOf, signIn as login } from '../../../__tests__/login.ts';
import { app } from '../../../app.ts';
import { clearTables, createTestUser, TEST_PASSWORD } from '../../../lib/db/test-db.ts';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../lib/errors.ts';
import { createUser, listUsers, registerUser, updateUser } from '../service.ts';

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

    await updateUser(
      created.id,
      { password: 'new-password-123', currentPassword: alice.password },
      created.id,
    );
    expect(await listUsers()).toEqual([created]);
    for (const cookie of cookies)
      expect((await app.request('/api/trpc/me.get', { headers: { cookie } })).status).toBe(401);
    expect((await login(alice.email, alice.password)).status).toBe(401);
    expect((await login(alice.email, 'new-password-123')).status).toBe(200);
  });

  it('いないユーザーは変更できない', async () => {
    const id = newId();
    await expect(updateUser(id, { name: 'だれか' }, id)).rejects.toThrow(NotFoundError);
    // 本人の確認は通らない（パスワードの行が無い）ので、在るかどうかを確かめる前に拒む
    await expect(
      updateUser(id, { password: 'new-password-123', currentPassword: 'x' }, id),
    ).rejects.toThrow(ForbiddenError);
  });

  it('他のユーザーのプロフィールは変更できるが、パスワードは変更できない', async () => {
    const created = await createUser(alice);
    const other = await createTestUser('B');
    await updateUser(created.id, { name: 'Alicia' }, other);
    await expect(
      updateUser(
        created.id,
        { name: 'Mallory', password: 'stolen-password-1', currentPassword: TEST_PASSWORD },
        other,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    // 拒否したときはプロフィールも変えない
    expect((await listUsers()).find((u) => u.id === created.id)?.name).toBe('Alicia');
    expect((await login(alice.email, alice.password)).status).toBe(200);
  });

  it('今のパスワードが違う・無いと自分のパスワードは変えられず、プロフィールも変えない', async () => {
    const created = await createUser(alice);
    for (const currentPassword of ['wrong-password-1', undefined]) {
      await expect(
        updateUser(
          created.id,
          { name: 'Mallory', password: 'stolen-password-1', currentPassword },
          created.id,
        ),
      ).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(await listUsers()).toEqual([created]);
    expect((await login(alice.email, alice.password)).status).toBe(200);
  });

  it('画面からの登録は、登録する人の今のパスワードが合うときだけ作る', async () => {
    const actor = await createTestUser('A');
    const bob = { email: 'bob@example.com', name: 'Bob', password: 'password-bob-12' };
    await expect(
      registerUser({ ...bob, currentPassword: 'wrong-password-1' }, actor),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect((await listUsers()).map((u) => u.email)).not.toContain(bob.email);

    const created = await registerUser({ ...bob, currentPassword: TEST_PASSWORD }, actor);
    expect(created).toMatchObject({ name: 'Bob', email: bob.email });
    expect((await login(bob.email, bob.password)).status).toBe(200);
  });

  it('パスワードを変える入力には今のパスワードが要り、今のパスワードだけでは変更にならない', () => {
    const missing = updateUserSchema.safeParse({ password: 'new-password-123' });
    expect(missing.error?.issues).toMatchObject([{ path: ['currentPassword'] }]);
    expect(updateUserSchema.safeParse({ currentPassword: 'x' }).success).toBe(false);
    expect(
      updateUserSchema.safeParse({ password: 'new-password-123', currentPassword: 'x' }).success,
    ).toBe(true);
  });
});
