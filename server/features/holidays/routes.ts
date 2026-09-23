import { Hono } from 'hono';
import type { AppEnv } from '../../lib/app-env.ts';
import { requireCronSecret } from '../../lib/middleware.ts';
import * as service from './service.ts';

export const holidaysRoutes = new Hono<AppEnv>().get('/', async (c) =>
  c.json(await service.listHolidays()),
);

/**
 * 月次の Cron（`vercel.json`）が呼ぶ取り直し。セッションではなく Cron secret で保護するので、
 * server/app.ts で認証ミドルウェアより前に登録する。
 */
export const holidaysCronRoutes = new Hono<AppEnv>().get('/refresh', requireCronSecret, async (c) =>
  c.json({ count: (await service.refreshHolidays()).length }),
);
