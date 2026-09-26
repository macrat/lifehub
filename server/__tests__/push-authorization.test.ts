import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../app.ts';
import { isSubscribed, subscribe } from '../features/push/service.ts';
import { clearTables } from '../lib/db/test-db.ts';
import { loginAs } from './login.ts';

describe('通知購読の認可', () => {
  beforeEach(clearTables);
  it('他人の購読は削除できず、自分の購読は削除できる', async () => {
    const owner = await loginAs('A');
    const other = await loginAs('B');
    const endpoint = 'https://fcm.googleapis.com/fcm/send/test';
    await subscribe(owner.userId, { endpoint, keys: { p256dh: 'test', auth: 'test' } }, null);
    for (const [{ cookie }, removed] of [
      [other, false],
      [owner, true],
    ] as const) {
      const response = await app.request('/api/push/subscriptions', {
        method: 'DELETE',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      });
      expect(response.status).toBe(204);
      expect(await isSubscribed(owner.userId, endpoint)).toBe(!removed);
    }
  });
});
