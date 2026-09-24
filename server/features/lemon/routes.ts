import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { idParamSchema } from '../../../shared/validation/common.ts';
import {
  careLogListQuerySchema,
  careLogSchema,
  createCareLogRequestSchema,
} from '../../../shared/validation/lemon.ts';
import type { AppEnv } from '../../lib/app-env.ts';
import { validationHook } from '../../lib/validator.ts';
import * as service from './service.ts';

export const lemonRoutes = new Hono<AppEnv>()
  .get('/status', async (c) => c.json(await service.getStatus()))
  .get('/logs', zValidator('query', careLogListQuerySchema, validationHook), async (c) =>
    c.json(await service.listLogs(c.req.valid('query'))),
  )
  .post('/logs', zValidator('json', createCareLogRequestSchema, validationHook), async (c) => {
    const { id, ...input } = c.req.valid('json');
    await service.logCare(input, c.get('user').id, id);
    return c.body(null, 204);
  })
  .put(
    '/logs/:id',
    zValidator('param', idParamSchema, validationHook),
    zValidator('json', careLogSchema, validationHook),
    async (c) => {
      await service.updateLog(c.req.valid('param').id, c.req.valid('json'));
      return c.body(null, 204);
    },
  )
  .delete('/logs/:id', zValidator('param', idParamSchema, validationHook), async (c) => {
    await service.deleteLog(c.req.valid('param').id);
    return c.body(null, 204);
  });
