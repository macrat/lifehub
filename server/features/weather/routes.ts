import { Hono } from 'hono';
import type { AppEnv } from '../../lib/app-env.ts';
import * as service from './service.ts';

/** 週間天気（`/api/weather`）。今日から週間予報の終わりまでの日ごとの天気 */
export const weatherRoutes = new Hono<AppEnv>().get('/', async (c) =>
  c.json(await service.listForecast()),
);
