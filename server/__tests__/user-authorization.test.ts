import { beforeEach, describe, expect, it } from 'vitest';
import { clearTables, createTestUser, TEST_PASSWORD, testEmail } from '../lib/db/test-db.ts';
import { apiClient, loginAs, signIn } from './login.ts';

describe('ユーザー更新の認可', () => {
  beforeEach(clearTables);

  it('別ユーザーのパスワードは変更できない', async () => {
    const { cookie } = await loginAs('A');
    const other = await createTestUser('B');

    await expect(
      apiClient(cookie).users.update.mutate({ id: other, password: 'stolen-account-123' }),
    ).rejects.toMatchObject({ data: { httpStatus: 403 } });
    expect((await signIn(testEmail('B'), TEST_PASSWORD)).status).toBe(200);
  });
});
