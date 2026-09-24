import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../app.ts';
import { isSubscribed, subscribe } from '../features/push/service.ts';
import { createUser } from '../features/users/service.ts';
import { truncateAll } from '../lib/test-db.ts';
import { cookieOf, signIn } from './login.ts';

describe('通知購読の認可', () => {
  beforeEach(truncateAll);
  it('他人の購読は削除できず、自分の購読は削除できる', async () => {
    const owner = await createUser({
      email: 'owner@example.com',
      name: 'Owner',
      password: 'password-owner-123',
    });
    await createUser({ email: 'other@example.com', name: 'Other', password: 'password-other-123' });
    const endpoint = 'https://fcm.googleapis.com/fcm/send/test';
    await subscribe(owner.id, { endpoint, keys: { p256dh: 'test', auth: 'test' } }, null);
    for (const [email, password, removed] of [
      ['other@example.com', 'password-other-123', false],
      ['owner@example.com', 'password-owner-123', true],
    ] as const) {
      const cookie = cookieOf(await signIn(email, password));
      const response = await app.request('/api/push/subscriptions', {
        method: 'DELETE',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      });
      expect(response.status).toBe(204);
      expect(await isSubscribed(owner.id, endpoint)).toBe(!removed);
    }
  });
});
