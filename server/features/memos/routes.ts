import { idParamSchema, withId } from '../../../shared/validation/common.ts';
import {
  createMemoRequestSchema,
  memoPinSchema,
  memoSchema,
} from '../../../shared/validation/memos.ts';
import { procedure, router } from '../../lib/trpc.ts';
import * as service from './service.ts';

/**
 * メモの読み書き。メモを読むのはタイムライン（`timeline.get`）で、ここで読むのはタイムラインの一番上に
 * 固定するピン止めしたメモ（`pinned`）だけ
 */
export const memosRouter = router({
  pinned: procedure.query(() => service.listPinnedMemos()),
  create: procedure
    .input(createMemoRequestSchema)
    .mutation(async ({ ctx, input: { id, ...input } }) => {
      await service.addMemo(input, { userId: ctx.userId }, id);
    }),
  update: procedure.input(withId(memoSchema)).mutation(async ({ ctx, input: { id, ...input } }) => {
    await service.updateMemo(id, input, ctx.userId);
  }),
  pin: procedure.input(withId(memoPinSchema)).mutation(async ({ input }) => {
    await service.setMemoPinned(input.id, input.pinned);
  }),
  delete: procedure.input(idParamSchema).mutation(async ({ ctx, input }) => {
    await service.deleteMemo(input.id, ctx.userId);
  }),
});
