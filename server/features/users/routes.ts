import { withId } from '../../../shared/validation/common.ts';
import { createUserSchema, updateUserSchema } from '../../../shared/validation/users.ts';
import { procedure, router, userProcedure } from '../../lib/trpc.ts';
import * as service from './service.ts';

/** ログイン中のユーザーとユーザーの一覧。画面が必ず一緒に使うので 1 つの応答にまとめる */
export const meRouter = router({
  get: procedure.query(({ ctx }) => service.getMe(ctx.user())),
});

/** ユーザーの登録と変更。一覧はログイン中のユーザーと一緒に `me.get` が返す */
export const usersRouter = router({
  create: procedure.input(createUserSchema).mutation(async ({ input }) => {
    await service.createUser(input);
  }),
  update: userProcedure
    .input(withId(updateUserSchema))
    .mutation(async ({ ctx, input: { id, ...input } }) => {
      await service.updateUser(id, input, ctx.userId);
    }),
});
