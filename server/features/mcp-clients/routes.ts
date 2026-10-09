import { idParamSchema } from '../../../shared/validation/common.ts';
import { procedure, router } from '../../lib/trpc.ts';
import * as service from './service.ts';

/** 接続を許可した MCP クライアントの管理。ログイン中のユーザー自身の許可だけを扱う */
export const mcpClientsRouter = router({
  list: procedure.query(async ({ ctx }) => service.listClients(ctx.user.id)),
  revoke: procedure
    .input(idParamSchema)
    .mutation(async ({ ctx, input }) => service.revokeClient(input.id, ctx.user.id)),
});
