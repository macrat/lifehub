import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../app.ts';
import { createUser } from '../features/users/service.ts';
import { truncateAll } from '../lib/test-db.ts';

async function login(email: string, password: string): Promise<string> {
  const response = await app.request('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
}

describe('ユーザー更新の認可', () => {
  beforeEach(truncateAll);

  it('別ユーザーのパスワードは変更できない', async () => {
    await createUser({ email: 'alice@example.com', name: 'Alice', password: 'password-alice-1' });
    const bob = await createUser({
      email: 'bob@example.com',
      name: 'Bob',
      password: 'password-bob-123',
    });
    const cookie = await login('alice@example.com', 'password-alice-1');

    const response = await app.request(`/api/users/${bob.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ password: 'stolen-account-123' }),
    });

    expect(response.status).toBe(403);
    expect(
      (
        await app.request('/api/auth/sign-in/email', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'bob@example.com', password: 'password-bob-123' }),
        })
      ).status,
    ).toBe(200);
  });
});
