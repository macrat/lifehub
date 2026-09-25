import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { idParamSchema } from '../../../shared/validation/common.ts';
import { createMemoRequestSchema, memoSchema } from '../../../shared/validation/memos.ts';
import type { AppEnv } from '../../lib/app-env.ts';
import { validationHook } from '../../lib/validator.ts';
import * as service from './service.ts';

/** メモの書き込み。読むのはタイムライン（`GET /api/timeline`）だけなので、一覧の口は持たない */
export const memosRoutes = new Hono<AppEnv>()
  .post('/', zValidator('json', createMemoRequestSchema, validationHook), async (c) => {
    const { id, ...input } = c.req.valid('json');
    await service.addMemo(input, c.get('user').id, id);
    return c.body(null, 204);
  })
  .put(
    '/:id',
    zValidator('param', idParamSchema, validationHook),
    zValidator('json', memoSchema, validationHook),
    async (c) => {
      await service.updateMemo(c.req.valid('param').id, c.req.valid('json'), c.get('user').id);
      return c.body(null, 204);
    },
  )
  .delete('/:id', zValidator('param', idParamSchema, validationHook), async (c) => {
    await service.deleteMemo(c.req.valid('param').id, c.get('user').id);
    return c.body(null, 204);
  });
