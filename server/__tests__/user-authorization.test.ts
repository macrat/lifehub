import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { accounts } from '../features/users/schema.ts';
import { db } from '../lib/db/client.ts';
import { clearTables, createTestUser, TEST_PASSWORD } from '../lib/db/test-db.ts';
import { apiClient, loginAs } from './login.ts';

/** そのユーザーのパスワードのハッシュ（変わっていないことを、ログインせずに比べる） */
async function passwordOf(userId: string) {
  return await db
    .select({ password: accounts.password })
    .from(accounts)
    .where(eq(accounts.userId, userId));
}

describe('ユーザーの登録とパスワードの変更の認可', () => {
  beforeEach(clearTables);

  it('プロフィールの変更ではパスワードを変えられない（他人の分も自分の分も）', async () => {
    const { cookie, userId } = await loginAs('A');
    const other = await createTestUser('B');
    const before = [await passwordOf(userId), await passwordOf(other)];

    for (const id of [userId, other]) {
      await expect(
        // @ts-expect-error プロフィールの変更にパスワードを載せる要求
        apiClient(cookie).users.update.mutate({ id, password: 'stolen-account-123' }),
      ).rejects.toMatchObject({ data: { httpStatus: 400 } });
    }
    expect([await passwordOf(userId), await passwordOf(other)]).toEqual(before);
  });

  it('パスワードの変更は、今のパスワードが合うときだけ通る', async () => {
    const { cookie, userId } = await loginAs('A');
    const api = apiClient(cookie);
    const before = await passwordOf(userId);

    await expect(
      // @ts-expect-error 今のパスワードを添えない要求
      api.me.changePassword.mutate({ newPassword: 'stolen-account-123' }),
    ).rejects.toMatchObject({ data: { httpStatus: 400 } });
    await expect(
      api.me.changePassword.mutate({
        newPassword: 'stolen-account-123',
        currentPassword: 'wrong-password-1',
      }),
    ).rejects.toMatchObject({ data: { httpStatus: 403 } });
    expect(await passwordOf(userId)).toEqual(before);

    await api.me.changePassword.mutate({
      newPassword: 'new-password-123',
      currentPassword: TEST_PASSWORD,
    });
    expect(await passwordOf(userId)).not.toEqual(before);
    // この端末のセッションも切れる
    await expect(api.me.get.query()).rejects.toMatchObject({ data: { httpStatus: 401 } });
  });

  it('ユーザーの登録は、登録する人の今のパスワードが合うときだけ通る', async () => {
    const { cookie } = await loginAs('A');
    const api = apiClient(cookie);
    const newUser = { email: 'bob@example.com', name: 'Bob', password: 'password-bob-12' };
    const emails = async () => (await api.me.get.query()).users.map((u) => u.email);

    // @ts-expect-error 今のパスワードを添えない要求
    await expect(api.users.create.mutate(newUser)).rejects.toMatchObject({
      data: { httpStatus: 400 },
    });
    await expect(
      api.users.create.mutate({ ...newUser, currentPassword: 'wrong-password-1' }),
    ).rejects.toMatchObject({ data: { httpStatus: 403 } });
    expect(await emails()).not.toContain(newUser.email);

    await api.users.create.mutate({ ...newUser, currentPassword: TEST_PASSWORD });
    expect(await emails()).toContain(newUser.email);
  });
});
