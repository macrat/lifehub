import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { dateRangeQuerySchema } from '../../../shared/validation/common.ts';
import type { AppEnv } from '../../lib/app-env.ts';
import * as service from './service.ts';

export const calendarRoutes = new Hono<AppEnv>().get(
  '/items',
  zValidator('query', dateRangeQuerySchema),
  async (c) => c.json(await service.listItems(c.req.valid('query'))),
);
