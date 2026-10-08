import { idParamSchema, withId } from '../../../shared/validation/common.ts';
import {
  completeEventRequestSchema,
  completeEventSchema,
  createEventRequestSchema,
  occurrenceTargetSchema,
  updateEventSchema,
} from '../../../shared/validation/events.ts';
import { procedure, router } from '../../lib/trpc.ts';
import * as service from './service.ts';

/** 予定・タスクの読み書き。カレンダーに並べる一覧はカレンダーの手続き（`calendar.get`）が返す */
export const eventsRouter = router({
  get: procedure.input(idParamSchema).query(({ input }) => service.getEvent(input.id)),
  create: procedure
    .input(createEventRequestSchema)
    .mutation(async ({ ctx, input: { id, ...input } }) => {
      await service.createEvent(input, ctx.userId, id);
    }),
  update: procedure
    .input(withId(updateEventSchema))
    .mutation(async ({ ctx, input: { id, ...input } }) => {
      await service.updateEvent(id, input, ctx.userId);
    }),
  delete: procedure
    .input(withId(occurrenceTargetSchema))
    .mutation(async ({ ctx, input: { id, ...input } }) => {
      await service.deleteEvent(id, input, ctx.userId);
    }),
  complete: procedure
    .input(withId(completeEventRequestSchema))
    .mutation(async ({ ctx, input: { id, completedAt, ...input } }) => {
      await service.completeEvent(id, input, ctx.userId, completedAt);
    }),
  uncomplete: procedure
    .input(withId(completeEventSchema))
    .mutation(async ({ ctx, input: { id, ...input } }) => {
      await service.uncompleteEvent(id, input, ctx.userId);
    }),
});
