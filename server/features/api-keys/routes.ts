import { apiKeySchema } from '../../../shared/validation/api-keys.ts';
import { idParamSchema } from '../../../shared/validation/common.ts';
import { router, userProcedure } from '../../lib/trpc.ts';
import * as service from './service.ts';

/** API キーの管理。ログイン中のユーザー自身のキーだけを扱う */
export const apiKeysRouter = router({
  list: userProcedure.query(async ({ ctx }) => service.listKeys(ctx.userId)),
  /** 発行したキーそのものは、この応答でしか見せられないので返す */
  create: userProcedure
    .input(apiKeySchema)
    .mutation(async ({ ctx, input }) => service.createKey(input, ctx.userId)),
  revoke: userProcedure
    .input(idParamSchema)
    .mutation(async ({ ctx, input }) => service.revokeKey(input.id, ctx.userId)),
});
