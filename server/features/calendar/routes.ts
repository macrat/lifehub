import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { dateRangeQuerySchema } from '../../../shared/validation/common.ts';
import type { AppEnv } from '../../lib/app-env.ts';
import { validationHook } from '../../lib/validator.ts';
import * as service from './service.ts';

/** カレンダーの 1 期間分（`/api/calendar?from&to`） */
export const calendarRoutes = new Hono<AppEnv>().get(
  '/',
  zValidator('query', dateRangeQuerySchema, validationHook),
  async (c) => c.json(await service.getCalendar(c.req.valid('query'))),
);
