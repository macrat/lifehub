import { describe, expect, it } from 'vitest';
import { app } from '../app.ts';

describe('Vercel Cron の入口', () => {
  it('Cron secret が無ければどれも 401', async () => {
    for (const path of [
      '/api/cron/notifications',
      '/api/cron/holidays',
      '/api/cron/weather',
      '/api/cron/unknown',
    ]) {
      expect((await app.request(path)).status).toBe(401);
    }
  });

  it('Cron secret が違えば 401', async () => {
    const res = await app.request('/api/cron/notifications', {
      headers: { authorization: 'Bearer wrong-secret' },
    });
    expect(res.status).toBe(401);
  });

  it('Cron secret があれば通る', async () => {
    const res = await app.request('/api/cron/notifications', {
      headers: { authorization: 'Bearer test-cron-secret' },
    });
    expect(res.status).toBe(200);
  });
});
