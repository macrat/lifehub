import { describe, expect, it } from 'vitest';
import { app } from '../app.ts';

describe('通知の外部エントリ', () => {
  it('Cron secret が無ければ 401', async () => {
    expect((await app.request('/api/notifications/enqueue')).status).toBe(401);
    expect(
      (
        await app.request('/api/notifications/enqueue', {
          headers: { authorization: 'Bearer test-cron-secret' },
        })
      ).status,
    ).toBe(200);
  });

  it('QStash の署名が無ければ 401', async () => {
    const res = await app.request('/api/notifications/deliver', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'task:x' }),
    });
    expect(res.status).toBe(401);
  });
});
