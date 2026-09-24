import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { idParamSchema } from '../../../shared/validation/common.ts';
import {
  completeEventSchema,
  createEventRequestSchema,
  occurrenceTargetSchema,
  updateEventSchema,
} from '../../../shared/validation/events.ts';
import type { AppEnv } from '../../lib/app-env.ts';
import { validationHook } from '../../lib/validator.ts';
import * as service from './service.ts';

/** 予定・タスクの読み書き。カレンダーに並べる一覧はカレンダーの問い合わせ（`/api/calendar`）が返す */
export const eventsRoutes = new Hono<AppEnv>()
  .get('/:id', zValidator('param', idParamSchema, validationHook), async (c) =>
    c.json(await service.getEvent(c.req.valid('param').id)),
  )
  .post('/', zValidator('json', createEventRequestSchema, validationHook), async (c) => {
    const { id, ...input } = c.req.valid('json');
    await service.createEvent(input, c.get('user').id, id);
    return c.body(null, 204);
  })
  .put(
    '/:id',
    zValidator('param', idParamSchema, validationHook),
    zValidator('json', updateEventSchema, validationHook),
    async (c) => {
      await service.updateEvent(c.req.valid('param').id, c.req.valid('json'), c.get('user').id);
      return c.body(null, 204);
    },
  )
  .delete(
    '/:id',
    zValidator('param', idParamSchema, validationHook),
    zValidator('json', occurrenceTargetSchema, validationHook),
    async (c) => {
      await service.deleteEvent(c.req.valid('param').id, c.req.valid('json'), c.get('user').id);
      return c.body(null, 204);
    },
  )
  .post(
    '/:id/complete',
    zValidator('param', idParamSchema, validationHook),
    zValidator('json', completeEventSchema, validationHook),
    async (c) => {
      await service.completeEvent(c.req.valid('param').id, c.req.valid('json'), c.get('user').id);
      return c.body(null, 204);
    },
  )
  .delete(
    '/:id/complete',
    zValidator('param', idParamSchema, validationHook),
    zValidator('json', completeEventSchema, validationHook),
    async (c) => {
      await service.uncompleteEvent(c.req.valid('param').id, c.req.valid('json'), c.get('user').id);
      return c.body(null, 204);
    },
  );
