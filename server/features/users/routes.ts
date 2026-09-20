import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
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
      const user = await service.updateUser(c.req.valid('param').id, c.req.valid('json'));
      return c.json(user);
    },
  );
