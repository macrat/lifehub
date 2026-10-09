import { withId } from '../../../shared/validation/common.ts';
import {
  changePasswordSchema,
  registerUserSchema,
  updateUserSchema,
} from '../../../shared/validation/users.ts';
import { procedure, reauthedProcedure, router } from '../../lib/trpc.ts';
import * as service from './service.ts';

/** ログイン中のユーザー自身のこと。一覧は画面が必ず一緒に使うので `get` の 1 つの応答にまとめる */
export const meRouter = router({
  get: procedure.query(({ ctx }) => service.getMe(ctx.user)),
  /** 本人のパスワードの変更。全端末（この端末も）のセッションが切れる */
  changePassword: reauthedProcedure.input(changePasswordSchema).mutation(async ({ ctx, input }) => {
    await service.changePassword(ctx.user.id, input.newPassword);
  }),
});

/** ユーザーの登録と共有プロフィールの変更。一覧はログイン中のユーザーと一緒に `me.get` が返す */
export const usersRouter = router({
  create: reauthedProcedure
    .input(registerUserSchema)
    .mutation(async ({ input: { currentPassword: _, ...input } }) => {
      await service.createUser(input);
    }),
  update: procedure
    .input(withId(updateUserSchema))
    .mutation(async ({ input: { id, ...input } }) => {
      await service.updateUser(id, input);
    }),
});
