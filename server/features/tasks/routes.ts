import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { dateRangeQuerySchema, uuidSchema } from '../../../shared/validation/common.ts';
import {
  completeTaskSchema,
  createTaskSchema,
  deleteTaskSchema,
  updateTaskSchema,
} from '../../../shared/validation/tasks.ts';
import type { AppEnv } from '../../lib/app-env.ts';
import * as service from './service.ts';

const idParam = z.object({ id: uuidSchema });

export const tasksRoutes = new Hono<AppEnv>()
  .get('/', zValidator('query', dateRangeQuerySchema), async (c) =>
    c.json(await service.listOccurrences(c.req.valid('query'))),
  )
  .get('/:id', zValidator('param', idParam), async (c) =>
    c.json(await service.getTask(c.req.valid('param').id)),
  )
  .post('/', zValidator('json', createTaskSchema), async (c) => {
    const task = await service.createTask(c.req.valid('json'), c.get('user').id);
    return c.json(task, 201);
  })
  .put('/:id', zValidator('param', idParam), zValidator('json', updateTaskSchema), async (c) => {
    const task = await service.updateTask(
      c.req.valid('param').id,
      c.req.valid('json'),
      c.get('user').id,
    );
    return c.json(task);
  })
  .delete('/:id', zValidator('param', idParam), zValidator('json', deleteTaskSchema), async (c) => {
    await service.deleteTask(c.req.valid('param').id, c.req.valid('json'), c.get('user').id);
    return c.body(null, 204);
  })
  .post(
    '/:id/complete',
    zValidator('param', idParam),
    zValidator('json', completeTaskSchema),
    async (c) => {
      await service.completeTask(
        c.req.valid('param').id,
        c.req.valid('json').occurrenceKey,
        c.get('user').id,
      );
      return c.body(null, 204);
    },
  )
  .delete(
    '/:id/complete',
    zValidator('param', idParam),
    zValidator('json', completeTaskSchema),
    async (c) => {
      await service.uncompleteTask(c.req.valid('param').id, c.req.valid('json').occurrenceKey);
      return c.body(null, 204);
    },
  );
