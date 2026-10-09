import { requireMcpAuth } from '@better-auth/mcp';
import { createResourceServerChallenge } from '@better-auth/oauth-provider';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { APIError } from 'better-auth/api';
import { Hono } from 'hono';
import { registerEventTools } from './features/events/mcp.ts';
import { registerLemonTools } from './features/lemon/mcp.ts';
import { isAuthorized } from './features/mcp-clients/service.ts';
import { registerEventSubscriptions } from './features/mcp-events/mcp.ts';
import { registerMemoTools } from './features/memos/mcp.ts';
import { registerExpenseTools } from './features/money/mcp.ts';
import { registerTimelineTools } from './features/timeline/mcp.ts';
import { getOAuthClientName, listPeople } from './features/users/people.ts';
import { registerWeatherTools } from './features/weather/mcp.ts';
import { CONSENT_ID_CLAIM, getAuth, MCP_RESOURCE } from './lib/auth.ts';
import type { McpContext, McpRegistrar } from './lib/mcp/types.ts';
import type { Person } from './lib/people.ts';
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
  'LifeHub は 2 人（家族）の家庭用アプリ。記録はすべて、日付の上に並ぶタイムラインのエントリーとして扱う: 予定（event）、タスク（task）、お金の記録（expense。手で入れた立替と、Money Forward から取り込んだ口座の入出金。取り込んだものは読むだけ）、レモンの木の世話（lemon）、メモ（memo）。天気と祝日も日ごとに付く。',
  'まず get_overview で今日の日付・ユーザーの名前・直近の状況をつかむ。期間や過去の記録は read_timeline で読む。書き込みは種類ごとの add_* / log_lemon_care で足し（予定とタスクは同じ add_event で、kind で選ぶ）、エントリーの ref を update_* / set_task_done / delete_entry に渡して変える・消す。',
  '日付は JST の YYYY-MM-DD、日時は JST の YYYY-MM-DDTHH:mm（タイムゾーンは省ける）。人は名前（自分は "me"）で指す。',
].join('\n');

/** 検証した要求の主: ユーザー、MCP クライアント（OAuth のクライアント ID）、そのクライアントへのユーザーの許可（同意の id） */
type McpCaller = { userId: string; clientId: string; consentId: string };

/**
 * リクエストごとに MCP サーバーを組み立てる（ステートレス。サーバーレスのためセッションを持たない）。
 * ツールは UI と同じ service 層を呼ぶ。
 */
function createMcpServer({ userId, clientId, consentId }: McpCaller): McpServer {
  const server = new McpServer(
    { name: 'lifehub', version: '2.0.0' },
    { instructions: INSTRUCTIONS },
  );
  let people: Promise<Person[]> | undefined;
  const ctx: McpContext = {
    userId,
    consentId,
    people: () => {
      people ??= listPeople();
      return people;
    },
    // 名前の無いクライアントは "MCP" とだけ出す
    clientName: async () => (await getOAuthClientName(clientId)) || 'MCP',
  };
  for (const register of registrars) register(server, ctx);
  return server;
}

/**
 * 2026-07-28 の MCP（要求ごとに完結する）と、2025 年版のステートレスな Streamable HTTP の両方を受ける。
 * どちらも要求ごとに `createMcpServer` でサーバーを組み立て、セッションは持たない（サーバーレスのため）。
 */
const handler = createMcpHandler(({ authInfo }) => {
  const { userId, consentId } = authInfo?.extra ?? {};
  if (typeof userId !== 'string' || typeof consentId !== 'string' || !authInfo?.clientId) {
    throw new Error('MCP request without a verified user and client');
  }
  return createMcpServer({ userId, clientId: authInfo.clientId, consentId });
});

/**
 * 検証済みのユーザーとして MCP の要求を処理する（MCP エンドポイントとテストが同じ口を通る）。
 * 誰の要求かは `authInfo.extra.userId`、どの MCP クライアントからかは `authInfo.clientId`、その許可は
 * `authInfo.extra.consentId` で組み立て関数に渡す。ツールが読むのはこれらだけなので、AuthInfo のほかの項目
 * （トークン・スコープ）は空にする。
 */
export function serveMcp(
  request: Request,
  { userId, clientId, consentId }: McpCaller,
): Promise<Response> {
  return handler.fetch(request, {
    authInfo: { token: '', clientId, scopes: [], extra: { userId, consentId } },
  });
}

/**
 * MCP エンドポイント。
 * requireMcpAuth が Bearer の JWT を JWKS で検証し（署名・issuer・audience・期限）、未認証には
 * RFC 9728 の WWW-Authenticate を返してクライアントに認可フローを始めさせる。
 * トークンの sub をユーザー、azp（トークンを受け取った OAuth クライアント）を MCP クライアントとしてツールに渡す。
 * トークンの発行のもとになった許可（`CONSENT_ID_CLAIM`）が今もあるか（設定で失効していないか）を要求ごとに
 * DB で確かめ、無ければ 401 にする（理由は docs/features/mcp-clients.md の「失効」）。
 */
export const mcpRoutes = new Hono().all('/', async (c) => {
  const authorize = requireMcpAuth(
    await getAuth(),
    async (request, claims) => {
      const userId = claims.sub;
      const clientId = typeof claims.azp === 'string' ? claims.azp : undefined;
      const consentId = claims[CONSENT_ID_CLAIM];
      if (
        !userId ||
        !clientId ||
        typeof consentId !== 'string' ||
        !(await isAuthorized(consentId, userId, clientId))
      ) {
        return unauthorized();
      }
      setSentryUser(userId);
      return serveMcp(request, { userId, clientId, consentId });
    },
    { resource: MCP_RESOURCE },
  );
  return authorize(c.req.raw);
});

/**
 * 失効したクライアントへの応答。requireMcpAuth が無効なトークンに返すのと同じ 401（RFC 9728 の
 * WWW-Authenticate と JSON-RPC のエラー）にして、クライアントに認可をやり直させる。
 */
function unauthorized(): Response {
  const message = 'the client is no longer authorized';
  const challenge = createResourceServerChallenge(
    new APIError('UNAUTHORIZED', { message }),
    MCP_RESOURCE,
  );
  return Response.json(
    { jsonrpc: '2.0', error: { code: -32000, message }, id: null },
    { status: 401, headers: challenge?.headers },
  );
}
