import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { accounts } from '../features/users/schema.ts';
import { db } from '../lib/db/client.ts';
import { clearTables, createTestUser } from '../lib/db/test-db.ts';
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
      apiClient(cookie).users.update.mutate({ id: other, password: 'stolen-account-123' }),
    ).rejects.toMatchObject({ data: { httpStatus: 403 } });
    expect(await passwordOf(other)).toEqual(before);
  });
});
