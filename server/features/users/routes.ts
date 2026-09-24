import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { idParamSchema } from '../../../shared/validation/common.ts';
import { createUserSchema, updateUserSchema } from '../../../shared/validation/users.ts';
import type { AppEnv } from '../../lib/app-env.ts';
import { validationHook } from '../../lib/validator.ts';
import * as service from './service.ts';

/**
 * ユーザーの登録と変更。一覧はログイン中のユーザーと一緒に `/api/me` が返す。
 * 書き込みは本文を返さない（204）。画面は送った内容で先に書き換え、後で取り直して揃えるので、返しても読まれない。
 */
export const usersRoutes = new Hono<AppEnv>()
  .post('/', zValidator('json', createUserSchema, validationHook), async (c) => {
    await service.createUser(c.req.valid('json'));
    return c.body(null, 204);
  })
  .patch(
    '/:id',
    zValidator('param', idParamSchema, validationHook),
    zValidator('json', updateUserSchema, validationHook),
    async (c) => {
      await service.updateUser(c.req.valid('param').id, c.req.valid('json'), c.get('user').id);
      return c.body(null, 204);
    },
  );
