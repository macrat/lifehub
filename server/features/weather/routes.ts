import { Hono } from 'hono';
import { z } from 'zod';
import { cursorShape } from '../../../shared/validation/common.ts';
import type { AppEnv } from '../../lib/app-env.ts';
import { validate } from '../../lib/validator.ts';
import * as service from './service.ts';

/** 週間天気（`/api/weather?before`）。日ごとの天気と 3 時間ごとの天気を 1 ページずつ */
export const weatherRoutes = new Hono<AppEnv>().get(
  '/',
  validate('query', z.object(cursorShape)),
  async (c) => c.json(await service.listWeatherPage(c.req.valid('query').before)),
);
