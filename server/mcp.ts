import { requireMcpAuth } from '@better-auth/mcp';
import { StreamableHTTPTransport } from '@hono/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Hono } from 'hono';
import { registerEventTools } from './features/events/mcp.ts';
import { registerExpenseTools } from './features/expenses/mcp.ts';
import { registerLemonTools } from './features/lemon/mcp.ts';
import { registerUserTools } from './features/users/mcp.ts';
import type { AppEnv } from './lib/app-env.ts';
import { auth, MCP_RESOURCE } from './lib/auth.ts';
import type { McpContext, ToolRegistrar } from './lib/mcp/types.ts';

/** 全 feature のツール。新しい feature のツールはここに 1 行足す。 */
const registrars: ToolRegistrar[] = [
  registerUserTools,
  registerEventTools,
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
        'LifeHub は 2 人の家庭用アプリ。予定とタスク（events。kind で区別）、立替・精算（expenses）、レモンの木の世話記録（lemon）を扱う。日時は ISO 8601、日付は JST（Asia/Tokyo）の YYYY-MM-DD。ユーザー ID は users_list で調べる。',
    },
  );
  for (const register of registrars) register(server, ctx);
  return server;
}

/**
 * MCP エンドポイント（Streamable HTTP、ステートレス）。
 * requireMcpAuth が Bearer の JWT を JWKS で検証し（署名・issuer・audience・期限）、未認証には
 * RFC 9728 の WWW-Authenticate を返してクライアントに認可フローを始めさせる。
 * サーバーレスなのでリクエストごとにサーバーとトランスポートを組み立て、セッションは持たない。
 */
export const mcpRoutes = new Hono<AppEnv>().all('/', (c) => {
  const handler = requireMcpAuth(
    auth,
    async (_request, claims) => {
      const userId = claims.sub;
      if (!userId) return new Response('invalid token', { status: 401 });
      const server = createMcpServer({ userId });
      const transport = new StreamableHTTPTransport({ enableJsonResponse: true });
      await server.connect(transport);
      try {
        return (await transport.handleRequest(c)) ?? new Response(null, { status: 204 });
      } finally {
        await server.close();
      }
    },
    { resource: MCP_RESOURCE },
  );
  return handler(c.req.raw);
});
