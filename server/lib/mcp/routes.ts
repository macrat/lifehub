import { requireMcpAuth } from '@better-auth/mcp';
import { StreamableHTTPTransport } from '@hono/mcp';
import { Hono } from 'hono';
import type { AppEnv } from '../app-env.ts';
import { auth, MCP_RESOURCE } from '../auth.ts';
import { createMcpServer } from './server.ts';

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
