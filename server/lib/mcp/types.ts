import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/** MCP ツールの実行文脈。OAuth のアクセストークンから得たユーザー ID。 */
export type McpContext = {
  userId: string;
};

/** 各 feature の mcp.ts が export する登録関数。server/mcp.ts が列挙する。 */
export type ToolRegistrar = (server: McpServer, ctx: McpContext) => void;

/** ツールの結果をテキスト（JSON）で返す */
export function jsonResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

export function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}
