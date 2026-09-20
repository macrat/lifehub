import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { dateRangeQuerySchema, uuidSchema } from '../../../shared/validation/common.ts';
import {
  completeEventSchema,
  createEventSchema,
  deleteEventSchema,
  updateEventSchema,
} from '../../../shared/validation/events.ts';
import type { AppEnv } from '../../lib/app-env.ts';
import * as service from './service.ts';

const idParam = z.object({ id: uuidSchema });

export const eventsRoutes = new Hono<AppEnv>()
  .get('/', zValidator('query', dateRangeQuerySchema), async (c) =>
    c.json(await service.listItems(c.req.valid('query'))),
  )
  .get('/:id', zValidator('param', idParam), async (c) =>
    c.json(await service.getEvent(c.req.valid('param').id)),
  )
  .post('/', zValidator('json', createEventSchema), async (c) => {
    const event = await service.createEvent(c.req.valid('json'), c.get('user').id);
    return c.json(event, 201);
  })
  .put('/:id', zValidator('param', idParam), zValidator('json', updateEventSchema), async (c) => {
    const event = await service.updateEvent(
      c.req.valid('param').id,
      c.req.valid('json'),
      c.get('user').id,
    );
    return c.json(event);
  })
  .delete(
    '/:id',
    zValidator('param', idParam),
    zValidator('json', deleteEventSchema),
    async (c) => {
      await service.deleteEvent(c.req.valid('param').id, c.req.valid('json'), c.get('user').id);
      return c.body(null, 204);
    },
  )
  .post(
    '/:id/complete',
    zValidator('param', idParam),
    zValidator('json', completeEventSchema),
    async (c) => {
      await service.completeEvent(c.req.valid('param').id, c.req.valid('json'), c.get('user').id);
      return c.body(null, 204);
    },
  )
  .delete(
    '/:id/complete',
    zValidator('param', idParam),
    zValidator('json', completeEventSchema),
    async (c) => {
      await service.uncompleteEvent(c.req.valid('param').id, c.req.valid('json'), c.get('user').id);
      return c.body(null, 204);
    },
  );
