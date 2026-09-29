import { apiKeySchema } from '../../../shared/validation/api-keys.ts';
import { idParamSchema } from '../../../shared/validation/common.ts';
import { procedure, router } from '../../lib/trpc.ts';
import * as service from './service.ts';

/** API キーの管理。ログイン中のユーザー自身のキーだけを扱う */
export const apiKeysRouter = router({
  list: procedure.query(async ({ ctx }) => service.listKeys((await ctx.user).id)),
  /** 発行したキーそのものは、この応答でしか見せられないので返す */
  create: procedure
    .input(apiKeySchema)
    .mutation(async ({ ctx, input }) => service.createKey(input, (await ctx.user).id)),
  revoke: procedure
    .input(idParamSchema)
    .mutation(async ({ ctx, input }) => service.revokeKey(input.id, (await ctx.user).id)),
});
