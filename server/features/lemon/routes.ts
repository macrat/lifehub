import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { uuidSchema } from '../../../shared/validation/common.ts';
import { createCareLogSchema } from '../../../shared/validation/lemon.ts';
import type { AppEnv } from '../../lib/app-env.ts';
import { validationHook } from '../../lib/validator.ts';
import * as service from './service.ts';

const idParam = z.object({ id: uuidSchema });

export const lemonRoutes = new Hono<AppEnv>()
  .get('/status', async (c) => c.json(await service.getStatus()))
  .get('/logs', async (c) => c.json(await service.listLogs()))
  .post('/logs', zValidator('json', createCareLogSchema, validationHook), async (c) => {
    const log = await service.logCare(c.req.valid('json'), c.get('user').id);
    return c.json(log, 201);
  })
  .delete('/logs/:id', zValidator('param', idParam, validationHook), async (c) => {
    await service.deleteLog(c.req.valid('param').id);
    return c.body(null, 204);
  });
