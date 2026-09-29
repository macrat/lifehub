import { requireMcpAuth } from '@better-auth/mcp';
import { StreamableHTTPTransport } from '@hono/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Hono } from 'hono';
import { registerEventTools } from './features/events/mcp.ts';
import { registerExpenseTools } from './features/expenses/mcp.ts';
import { registerLemonTools } from './features/lemon/mcp.ts';
import { registerMemoTools } from './features/memos/mcp.ts';
import { registerTimelineTools } from './features/timeline/mcp.ts';
import { listUsers } from './features/users/service.ts';
import { registerWeatherTools } from './features/weather/mcp.ts';
import { getAuth, MCP_RESOURCE } from './lib/auth.ts';
import type { McpContext, Person, ToolRegistrar } from './lib/mcp/types.ts';
import { setSentryUser } from './lib/sentry.ts';

/** 全 feature のツール。新しい feature のツールはここに 1 行足す。 */
const registrars: ToolRegistrar[] = [
  registerTimelineTools,
  registerEventTools,
  registerExpenseTools,
  registerLemonTools,
  registerMemoTools,
  registerWeatherTools,
];

/**
 * サーバーの説明（MCP の instructions）。ツールを選ぶ前に LLM が読む、LifeHub の捉え方と約束事。
 * 個々のツールの使い方は各ツールの説明に書き、ここには全体に通じることだけを書く。
 */
const INSTRUCTIONS = [
  'LifeHub は 2 人（家族）の家庭用アプリ。記録はすべて、日付の上に並ぶタイムラインのエントリーとして扱う: 予定（event）、タスク（task）、立替（expense）、レモンの木の世話（lemon）、メモ（memo）。天気と祝日も日ごとに付く。',
  'まず get_overview で今日の日付・ユーザーの名前・直近の状況をつかむ。期間や過去の記録は read_timeline で読む。書き込みは種類ごとの add_* / log_lemon_care で足し（予定とタスクは同じ add_event で、kind で選ぶ）、エントリーの ref を update_* / set_task_done / delete_entry に渡して変える・消す。',
  '日付は JST の YYYY-MM-DD、日時は JST の YYYY-MM-DDTHH:mm（タイムゾーンは省ける）。人は名前（自分は "me"）で指す。',
].join('\n');

/**
 * リクエストごとに MCP サーバーを組み立てる（ステートレス。サーバーレスのためセッションを持たない）。
 * ツールは UI と同じ service 層を呼ぶ。
 */
export function createMcpServer({ userId }: { userId: string }): McpServer {
  const server = new McpServer(
    { name: 'lifehub', version: '2.0.0' },
    { instructions: INSTRUCTIONS },
  );
  let people: Promise<Person[]> | undefined;
  const ctx: McpContext = {
    userId,
    people: () => {
      people ??= listUsers().then((users) => users.map(({ id, name }) => ({ id, name })));
      return people;
    },
  };
  for (const register of registrars) register(server, ctx);
  return server;
}

/**
 * MCP エンドポイント（Streamable HTTP、ステートレス）。
 * requireMcpAuth が Bearer の JWT を JWKS で検証し（署名・issuer・audience・期限）、未認証には
 * RFC 9728 の WWW-Authenticate を返してクライアントに認可フローを始めさせる。
 * サーバーレスなのでリクエストごとにサーバーとトランスポートを組み立て、セッションは持たない。
 */
export const mcpRoutes = new Hono().all('/', async (c) => {
  const handler = requireMcpAuth(
    await getAuth(),
    async (_request, claims) => {
      const userId = claims.sub;
      if (!userId) return new Response('invalid token', { status: 401 });
      setSentryUser(userId);
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
