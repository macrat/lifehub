import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { addDays, startOfDate } from '../../../shared/date.ts';
import { dateRangeQuerySchema, uuidSchema } from '../../../shared/validation/common.ts';
import {
  createEventSchema,
  deleteEventSchema,
  updateEventSchema,
} from '../../../shared/validation/events.ts';
import type { AppEnv } from '../../lib/app-env.ts';
import * as service from './service.ts';

const idParam = z.object({ id: uuidSchema });

export const eventsRoutes = new Hono<AppEnv>()
  .get('/', zValidator('query', dateRangeQuerySchema), async (c) => {
    const { from, to } = c.req.valid('query');
    const items = await service.listOccurrences({
      from: startOfDate(from),
      to: startOfDate(addDays(to, 1)),
    });
    return c.json(items);
  })
  .get('/:id', zValidator('param', idParam), async (c) => {
    return c.json(await service.getEvent(c.req.valid('param').id));
  })
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
  );
