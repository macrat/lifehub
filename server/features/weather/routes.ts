import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { dateRangeQuerySchema } from '../../../shared/validation/common.ts';
import type { AppEnv } from '../../lib/app-env.ts';
import { validationHook } from '../../lib/validator.ts';
import * as service from './service.ts';

export const weatherRoutes = new Hono<AppEnv>().get(
  '/',
  zValidator('query', dateRangeQuerySchema, validationHook),
  async (c) => {
    const { from, to } = c.req.valid('query');
    return c.json(await service.listWeather(from, to));
  },
);
