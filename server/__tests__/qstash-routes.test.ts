import { describe, expect, it } from 'vitest';
import { app } from '../app.ts';

describe('QStash の配信コールバック', () => {
  it('署名が無ければどれも 401', async () => {
    for (const path of ['/api/qstash/notifications', '/api/qstash/unknown']) {
      const res = await app.request(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: 'task:x' }),
      });
      expect(res.status).toBe(401);
    }
  });
});
