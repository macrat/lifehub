import { idParamSchema, withId } from '../../../shared/validation/common.ts';
import { createMemoRequestSchema, memoSchema } from '../../../shared/validation/memos.ts';
import { procedure, router } from '../../lib/trpc.ts';
import * as service from './service.ts';

/** メモの書き込み。読むのはタイムライン（`timeline.get`）だけなので、一覧の手続きは持たない */
export const memosRouter = router({
  create: procedure
    .input(createMemoRequestSchema)
    .mutation(async ({ ctx, input: { id, ...input } }) => {
      await service.addMemo(input, (await ctx.user).id, id);
    }),
  update: procedure.input(withId(memoSchema)).mutation(async ({ ctx, input: { id, ...input } }) => {
    await service.updateMemo(id, input, (await ctx.user).id);
  }),
  delete: procedure.input(idParamSchema).mutation(async ({ ctx, input }) => {
    await service.deleteMemo(input.id, (await ctx.user).id);
  }),
});
