import { describe, expect, it } from 'vitest';
import { app } from '../app.ts';

describe('祝日の外部エントリ', () => {
  it('取り直しは Cron secret が無ければ 401', async () => {
    expect((await app.request('/api/holidays/refresh')).status).toBe(401);
  });

  it('一覧はログインが無ければ 401', async () => {
    expect((await app.request('/api/holidays')).status).toBe(401);
  });
});
