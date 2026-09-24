import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { apiKeySchema } from '../../../shared/validation/api-keys.ts';
import { idParamSchema } from '../../../shared/validation/common.ts';
import type { AppEnv } from '../../lib/app-env.ts';
import { validationHook } from '../../lib/validator.ts';
import * as service from './service.ts';

/** API キーの管理（`/api/api-keys`）。ログイン中のユーザー自身のキーだけを扱う */
export const apiKeysRoutes = new Hono<AppEnv>()
  .get('/', async (c) => c.json(await service.listKeys(c.get('user').id)))
  .post('/', zValidator('json', apiKeySchema, validationHook), async (c) => {
    const key = await service.createKey(c.req.valid('json'), c.get('user').id);
    return c.json(key, 201);
  })
  .delete('/:id', zValidator('param', idParamSchema, validationHook), async (c) => {
    await service.revokeKey(c.req.valid('param').id, c.get('user').id);
    return c.body(null, 204);
  });
