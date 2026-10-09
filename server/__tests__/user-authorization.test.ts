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

describe('ユーザー更新の認可', () => {
  beforeEach(clearTables);

  it('別ユーザーのパスワードは変更できない', async () => {
    const { cookie } = await loginAs('A');
    const other = await createTestUser('B');
    const before = await passwordOf(other);

    await expect(
      apiClient(cookie).users.update.mutate({
        id: other,
        password: 'stolen-account-123',
        currentPassword: TEST_PASSWORD,
      }),
    ).rejects.toMatchObject({ data: { httpStatus: 403 } });
    expect(await passwordOf(other)).toEqual(before);
  });

  it('セッションだけでは、自分のパスワードの変更もユーザーの登録もできない', async () => {
    const { cookie, userId } = await loginAs('A');
    const api = apiClient(cookie);
    const before = await passwordOf(userId);
    const newUser = { email: 'mallory@example.com', name: 'Mallory', password: 'mallory-pass-123' };

    // 今のパスワードを添えなければ入力の誤り、違えば拒否
    await expect(
      api.users.update.mutate({ id: userId, password: 'stolen-account-123' }),
    ).rejects.toMatchObject({ data: { httpStatus: 400 } });
    await expect(
      api.users.update.mutate({
        id: userId,
        password: 'stolen-account-123',
        currentPassword: 'wrong-password-1',
      }),
    ).rejects.toMatchObject({ data: { httpStatus: 403 } });
    expect(await passwordOf(userId)).toEqual(before);

    // @ts-expect-error 今のパスワードを添えない要求
    await expect(api.users.create.mutate(newUser)).rejects.toMatchObject({
      data: { httpStatus: 400 },
    });
    await expect(
      api.users.create.mutate({ ...newUser, currentPassword: 'wrong-password-1' }),
    ).rejects.toMatchObject({ data: { httpStatus: 403 } });
    expect((await api.me.get.query()).users.map((u) => u.email)).not.toContain(newUser.email);
  });
});
