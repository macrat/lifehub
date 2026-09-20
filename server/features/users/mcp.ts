import { jsonResult, type ToolRegistrar } from '../../lib/mcp/types.ts';
import * as service from './service.ts';

export const registerUserTools: ToolRegistrar = (server, ctx) => {
  server.registerTool(
    'users_list',
    {
      title: 'ユーザーの一覧',
      description:
        'LifeHub のユーザー（2 人）の ID と名前を返す。予定の ownerUserId、タスクの assigneeUserId、立替の paidBy に使う。isMe が true のユーザーが、この MCP セッションを認可した本人。',
      inputSchema: {},
    },
    async () =>
      jsonResult((await service.listUsers()).map((u) => ({ ...u, isMe: u.id === ctx.userId }))),
  );
};
