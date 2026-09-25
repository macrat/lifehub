import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { timelineQuerySchema } from '../../../shared/validation/timeline.ts';
import type { AppEnv } from '../../lib/app-env.ts';
import { validationHook } from '../../lib/validator.ts';
import * as service from './service.ts';

/** ホームのタイムラインの 1 ページ（`/api/timeline?q&since&until&before`） */
export const timelineRoutes = new Hono<AppEnv>().get(
  '/',
  zValidator('query', timelineQuerySchema, validationHook),
  async (c) => c.json(await service.getTimelinePage(c.req.valid('query'))),
);
