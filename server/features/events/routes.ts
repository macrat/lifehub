import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { dateRangeQuerySchema, idParamSchema } from '../../../shared/validation/common.ts';
import {
  completeEventSchema,
  createEventRequestSchema,
  deleteEventSchema,
  updateEventSchema,
} from '../../../shared/validation/events.ts';
import type { AppEnv } from '../../lib/app-env.ts';
import { validationHook } from '../../lib/validator.ts';
import * as service from './service.ts';

export const eventsRoutes = new Hono<AppEnv>()
  .get('/', zValidator('query', dateRangeQuerySchema, validationHook), async (c) =>
    c.json(await service.listItems(c.req.valid('query'))),
  )
  .get('/:id', zValidator('param', idParamSchema, validationHook), async (c) =>
    c.json(await service.getEvent(c.req.valid('param').id)),
  )
  .post('/', zValidator('json', createEventRequestSchema, validationHook), async (c) => {
    const { id, ...input } = c.req.valid('json');
    const event = await service.createEvent(input, c.get('user').id, id);
    return c.json(event, 201);
  })
  .put(
    '/:id',
    zValidator('param', idParamSchema, validationHook),
    zValidator('json', updateEventSchema, validationHook),
    async (c) => {
      const event = await service.updateEvent(
        c.req.valid('param').id,
        c.req.valid('json'),
        c.get('user').id,
      );
      return c.json(event);
    },
  )
  .delete(
    '/:id',
    zValidator('param', idParamSchema, validationHook),
    zValidator('json', deleteEventSchema, validationHook),
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
