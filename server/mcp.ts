import { requireMcpAuth } from '@better-auth/mcp';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { Hono } from 'hono';
import { registerEventTools } from './features/events/mcp.ts';
import { registerExpenseTools } from './features/expenses/mcp.ts';
import { registerLemonTools } from './features/lemon/mcp.ts';
import { registerEventSubscriptions } from './features/mcp-events/mcp.ts';
import { registerMemoTools } from './features/memos/mcp.ts';
import { registerTimelineTools } from './features/timeline/mcp.ts';
import { listPeople } from './features/users/service.ts';
import { registerWeatherTools } from './features/weather/mcp.ts';
import { getAuth, MCP_RESOURCE } from './lib/auth.ts';
import type { McpContext, McpRegistrar, Person } from './lib/mcp/types.ts';
import { setSentryUser } from './lib/sentry.ts';

/** 全 feature のツール（と MCP Events の購読）。新しい feature のツールはここに 1 行足す。 */
const registrars: McpRegistrar[] = [
  registerTimelineTools,
  registerEventTools,
  registerExpenseTools,
  registerLemonTools,
  registerMemoTools,
  registerWeatherTools,
  registerEventSubscriptions,
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
function createMcpServer({ userId }: { userId: string }): McpServer {
  const server = new McpServer(
    { name: 'lifehub', version: '2.0.0' },
    { instructions: INSTRUCTIONS },
  );
  let people: Promise<Person[]> | undefined;
  const ctx: McpContext = {
    userId,
    people: () => {
      people ??= listPeople();
      return people;
    },
  };
  for (const register of registrars) register(server, ctx);
  return server;
}

/**
 * 2026-07-28 の MCP（要求ごとに完結する）と、2025 年版のステートレスな Streamable HTTP の両方を受ける。
 * どちらも要求ごとに `createMcpServer` でサーバーを組み立て、セッションは持たない（サーバーレスのため）。
 */
const handler = createMcpHandler(({ authInfo }) => {
  const userId = authInfo?.extra?.userId;
  if (typeof userId !== 'string') throw new Error('MCP request without a verified user');
  return createMcpServer({ userId });
});

/**
 * 検証済みのユーザーとして MCP の要求を処理する（MCP エンドポイントとテストが同じ口を通る）。
 * 誰の要求かは `authInfo.extra.userId` で組み立て関数に渡す。ツールが読むのはユーザーだけなので、
 * AuthInfo のほかの項目（トークン・クライアント・スコープ）は空にする。
 */
export function serveMcp(request: Request, userId: string): Promise<Response> {
  return handler.fetch(request, {
    authInfo: { token: '', clientId: '', scopes: [], extra: { userId } },
  });
}

/**
 * MCP エンドポイント。
 * requireMcpAuth が Bearer の JWT を JWKS で検証し（署名・issuer・audience・期限）、未認証には
 * RFC 9728 の WWW-Authenticate を返してクライアントに認可フローを始めさせる。
 */
export const mcpRoutes = new Hono().all('/', async (c) => {
  const authorize = requireMcpAuth(
    await getAuth(),
    async (request, claims) => {
      const userId = claims.sub;
      if (!userId) return new Response('invalid token', { status: 401 });
      setSentryUser(userId);
      return serveMcp(request, userId);
    },
    { resource: MCP_RESOURCE },
  );
  return authorize(c.req.raw);
});
