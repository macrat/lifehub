import { Hono } from 'hono';
import { idParamSchema } from '../../../shared/validation/common.ts';
import {
  careLogListQuerySchema,
  careLogSchema,
  createCareLogRequestSchema,
} from '../../../shared/validation/lemon.ts';
import type { AppEnv } from '../../lib/app-env.ts';
import { validate } from '../../lib/validator.ts';
import * as service from './service.ts';

export const lemonRoutes = new Hono<AppEnv>()
  .get('/status', async (c) => c.json(await service.getStatus()))
  .get('/logs', validate('query', careLogListQuerySchema), async (c) =>
    c.json(await service.listLogs(c.req.valid('query'))),
  )
  .post('/logs', validate('json', createCareLogRequestSchema), async (c) => {
    const { id, ...input } = c.req.valid('json');
    await service.logCare(input, { userId: c.get('user').id }, id);
    return c.body(null, 204);
  })
  .put(
    '/logs/:id',
    validate('param', idParamSchema),
    validate('json', careLogSchema),
    async (c) => {
      await service.updateLog(c.req.valid('param').id, c.req.valid('json'));
      return c.body(null, 204);
    },
  )
  .delete('/logs/:id', validate('param', idParamSchema), async (c) => {
    await service.deleteLog(c.req.valid('param').id);
    return c.body(null, 204);
  });
