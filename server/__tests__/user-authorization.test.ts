import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../app.ts';
import { clearTables, createTestUser, TEST_PASSWORD, testEmail } from '../lib/db/test-db.ts';
import { loginAs, signIn } from './login.ts';

describe('ユーザー更新の認可', () => {
  beforeEach(clearTables);

  it('別ユーザーのパスワードは変更できない', async () => {
    const { cookie } = await loginAs('A');
    const other = await createTestUser('B');

    const response = await app.request(`/api/users/${other}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ password: 'stolen-account-123' }),
    });

    expect(response.status).toBe(403);
    expect((await signIn(testEmail('B'), TEST_PASSWORD)).status).toBe(200);
  });
});
