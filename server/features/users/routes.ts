import { Hono } from 'hono';
import { idParamSchema } from '../../../shared/validation/common.ts';
import { createUserSchema, updateUserSchema } from '../../../shared/validation/users.ts';
import type { AppEnv } from '../../lib/app-env.ts';
import { validate } from '../../lib/validator.ts';
import * as service from './service.ts';

/** ログイン中のユーザーとユーザーの一覧（`/api/me`）。画面が必ず一緒に使うので 1 つの応答にまとめる */
export const meRoutes = new Hono<AppEnv>().get('/', async (c) =>
  c.json(await service.getMe(c.get('user'))),
);

/** ユーザーの登録と変更。一覧はログイン中のユーザーと一緒に `/api/me` が返す */
export const usersRoutes = new Hono<AppEnv>()
  .post('/', validate('json', createUserSchema), async (c) => {
    await service.createUser(c.req.valid('json'));
    return c.body(null, 204);
  })
  .patch(
    '/:id',
    validate('param', idParamSchema),
    validate('json', updateUserSchema),
    async (c) => {
      await service.updateUser(c.req.valid('param').id, c.req.valid('json'), c.get('user').id);
      return c.body(null, 204);
    },
  );
