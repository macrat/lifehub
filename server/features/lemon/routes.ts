import { idParamSchema, withId } from '../../../shared/validation/common.ts';
import {
  careLogListQuerySchema,
  careLogSchema,
  createCareLogRequestSchema,
} from '../../../shared/validation/lemon.ts';
import { procedure, router } from '../../lib/trpc.ts';
import * as service from './service.ts';

export const lemonRouter = router({
  status: procedure.query(() => service.getStatus()),
  logs: procedure.input(careLogListQuerySchema).query(({ input }) => service.listLogs(input)),
  create: procedure
    .input(createCareLogRequestSchema)
    .mutation(async ({ ctx, input: { id, ...input } }) => {
      await service.logCare(input, { userId: ctx.userId }, id);
    }),
  update: procedure
    .input(withId(careLogSchema))
    .mutation(async ({ ctx, input: { id, ...input } }) => {
      await service.updateLog(id, input, ctx.userId);
    }),
  delete: procedure.input(idParamSchema).mutation(async ({ ctx, input }) => {
    await service.deleteLog(input.id, ctx.userId);
  }),
});
