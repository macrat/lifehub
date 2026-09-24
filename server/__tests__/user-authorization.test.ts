import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../app.ts';
import { createUser } from '../features/users/service.ts';
import { truncateAll } from '../lib/test-db.ts';
import { cookieOf, signIn } from './login.ts';

describe('ユーザー更新の認可', () => {
  beforeEach(truncateAll);

  it('別ユーザーのパスワードは変更できない', async () => {
    await createUser({ email: 'alice@example.com', name: 'Alice', password: 'password-alice-1' });
    const bob = await createUser({
      email: 'bob@example.com',
      name: 'Bob',
      password: 'password-bob-123',
    });
    const cookie = cookieOf(await signIn('alice@example.com', 'password-alice-1'));

    const response = await app.request(`/api/users/${bob.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ password: 'stolen-account-123' }),
    });

    expect(response.status).toBe(403);
    expect((await signIn('bob@example.com', 'password-bob-123')).status).toBe(200);
  });
});
