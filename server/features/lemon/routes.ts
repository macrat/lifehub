import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { uuidSchema } from '../../../shared/validation/common.ts';
import { careLogSchema, createCareLogRequestSchema } from '../../../shared/validation/lemon.ts';
import type { AppEnv } from '../../lib/app-env.ts';
import { validationHook } from '../../lib/validator.ts';
import * as service from './service.ts';

const idParam = z.object({ id: uuidSchema });

export const lemonRoutes = new Hono<AppEnv>()
  .get('/status', async (c) => c.json(await service.getStatus()))
  .get('/logs', async (c) => c.json(await service.listLogs()))
  .post('/logs', zValidator('json', createCareLogRequestSchema, validationHook), async (c) => {
    const { id, ...input } = c.req.valid('json');
    const log = await service.logCare(input, c.get('user').id, id);
    return c.json(log, 201);
  })
  .put(
    '/logs/:id',
    zValidator('param', idParam, validationHook),
    zValidator('json', careLogSchema, validationHook),
    async (c) => c.json(await service.updateLog(c.req.valid('param').id, c.req.valid('json'))),
  )
  .delete('/logs/:id', zValidator('param', idParam, validationHook), async (c) => {
    await service.deleteLog(c.req.valid('param').id);
    return c.body(null, 204);
  });
