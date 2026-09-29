import { Hono } from 'hono';
import { idParamSchema } from '../../../shared/validation/common.ts';
import { createMemoRequestSchema, memoSchema } from '../../../shared/validation/memos.ts';
import type { AppEnv } from '../../lib/app-env.ts';
import { validate } from '../../lib/validator.ts';
import * as service from './service.ts';

/** メモの書き込み。読むのはタイムライン（`GET /api/timeline`）だけなので、一覧の口は持たない */
export const memosRoutes = new Hono<AppEnv>()
  .post('/', validate('json', createMemoRequestSchema), async (c) => {
    const { id, ...input } = c.req.valid('json');
    await service.addMemo(input, (await c.var.user).id, id);
    return c.body(null, 204);
  })
  .put('/:id', validate('param', idParamSchema), validate('json', memoSchema), async (c) => {
    await service.updateMemo(c.req.valid('param').id, c.req.valid('json'), (await c.var.user).id);
    return c.body(null, 204);
  })
  .delete('/:id', validate('param', idParamSchema), async (c) => {
    await service.deleteMemo(c.req.valid('param').id, (await c.var.user).id);
    return c.body(null, 204);
  });
