import { Hono } from 'hono';
import { apiKeySchema } from '../../../shared/validation/api-keys.ts';
import { idParamSchema } from '../../../shared/validation/common.ts';
import type { AppEnv } from '../../lib/app-env.ts';
import { validate } from '../../lib/validator.ts';
import * as service from './service.ts';

/** API キーの管理（`/api/api-keys`）。ログイン中のユーザー自身のキーだけを扱う */
export const apiKeysRoutes = new Hono<AppEnv>()
  .get('/', async (c) => c.json(await service.listKeys(c.get('user').id)))
  .post('/', validate('json', apiKeySchema), async (c) => {
    const key = await service.createKey(c.req.valid('json'), c.get('user').id);
    return c.json(key, 201);
  })
  .delete('/:id', validate('param', idParamSchema), async (c) => {
    await service.revokeKey(c.req.valid('param').id, c.get('user').id);
    return c.body(null, 204);
  });
