import { Hono } from 'hono';
import { idParamSchema } from '../../../shared/validation/common.ts';
import {
  completeEventRequestSchema,
  completeEventSchema,
  createEventRequestSchema,
  occurrenceTargetSchema,
  updateEventSchema,
} from '../../../shared/validation/events.ts';
import type { AppEnv } from '../../lib/app-env.ts';
import { validate } from '../../lib/validator.ts';
import * as service from './service.ts';

/** 予定・タスクの読み書き。カレンダーに並べる一覧はカレンダーの問い合わせ（`/api/calendar`）が返す */
export const eventsRoutes = new Hono<AppEnv>()
  .get('/:id', validate('param', idParamSchema), async (c) =>
    c.json(await service.getEvent(c.req.valid('param').id)),
  )
  .post('/', validate('json', createEventRequestSchema), async (c) => {
    const { id, ...input } = c.req.valid('json');
    await service.createEvent(input, (await c.var.user).id, id);
    return c.body(null, 204);
  })
  .put('/:id', validate('param', idParamSchema), validate('json', updateEventSchema), async (c) => {
    await service.updateEvent(c.req.valid('param').id, c.req.valid('json'), (await c.var.user).id);
    return c.body(null, 204);
  })
  .delete(
    '/:id',
    validate('param', idParamSchema),
    validate('json', occurrenceTargetSchema),
    async (c) => {
      await service.deleteEvent(
        c.req.valid('param').id,
        c.req.valid('json'),
        (await c.var.user).id,
      );
      return c.body(null, 204);
    },
  )
  .post(
    '/:id/complete',
    validate('param', idParamSchema),
    validate('json', completeEventRequestSchema),
    async (c) => {
      const { completedAt, ...input } = c.req.valid('json');
      await service.completeEvent(
        c.req.valid('param').id,
        input,
        (await c.var.user).id,
        completedAt,
      );
      return c.body(null, 204);
    },
  )
  .delete(
    '/:id/complete',
    validate('param', idParamSchema),
    validate('json', completeEventSchema),
    async (c) => {
      await service.uncompleteEvent(
        c.req.valid('param').id,
        c.req.valid('json'),
        (await c.var.user).id,
      );
      return c.body(null, 204);
    },
  );
