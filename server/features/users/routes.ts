import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { createUserSchema, updateUserSchema } from '../../../shared/validation/users.ts';
import type { AppEnv } from '../../lib/app-env.ts';
import { validationHook } from '../../lib/validator.ts';
import * as service from './service.ts';

const idParam = z.object({ id: z.uuid() });

export const usersRoutes = new Hono<AppEnv>()
  .get('/', async (c) => c.json(await service.listUsers()))
  .post('/', zValidator('json', createUserSchema, validationHook), async (c) => {
    const user = await service.createUser(c.req.valid('json'));
    return c.json(user, 201);
  })
  .patch(
    '/:id',
    zValidator('param', idParam, validationHook),
    zValidator('json', updateUserSchema, validationHook),
    async (c) => {
      const id = c.req.valid('param').id;
      const input = c.req.valid('json');
      // 名前と表示色は家族で管理する共有プロフィールだが、認証情報は本人だけが変更できる。
      // これが無いと、片方のセッションを得た攻撃者がもう片方のパスワードも奪える。
      if (input.password !== undefined && id !== c.get('user').id) {
        throw new HTTPException(403, { message: '他のユーザーのパスワードは変更できません' });
      }
      const user = await service.updateUser(id, input);
      return c.json(user);
    },
  );
