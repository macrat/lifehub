import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerCalendarTools } from '../../features/calendar/mcp.ts';
import { registerEventTools } from '../../features/events/mcp.ts';
import { registerExpenseTools } from '../../features/expenses/mcp.ts';
import { registerLemonTools } from '../../features/lemon/mcp.ts';
import { registerTaskTools } from '../../features/tasks/mcp.ts';
import { registerUserTools } from '../../features/users/mcp.ts';
import type { McpContext, ToolRegistrar } from './types.ts';

/** 全 feature のツール。新しい feature のツールはここに 1 行足す。 */
const registrars: ToolRegistrar[] = [
  registerUserTools,
  registerEventTools,
  registerTaskTools,
  registerCalendarTools,
  registerExpenseTools,
  registerLemonTools,
];

/**
 * リクエストごとに MCP サーバーを組み立てる（ステートレス。サーバーレスのためセッションを持たない）。
 * ツールは UI と同じ service 層を呼ぶ。
 */
export function createMcpServer(ctx: McpContext): McpServer {
  const server = new McpServer(
    { name: 'lifehub', version: '1.0.0' },
    {
      instructions:
        'LifeHub は 2 人の家庭用アプリ。予定（events）、タスク（tasks）、立替・精算（expenses）、レモンの木の世話記録（lemon）を扱う。日時は ISO 8601、日付は JST（Asia/Tokyo）の YYYY-MM-DD。ユーザー ID は users_list で調べる。',
    },
  );
  for (const register of registrars) register(server, ctx);
  return server;
}
