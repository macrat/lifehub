import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { type Handler, Hono, type MiddlewareHandler } from 'hono';
import { etag } from 'hono/etag';
import { HTTPException } from 'hono/http-exception';
import { cronRoutes } from './cron.ts';
import { apiKeysRouter } from './features/api-keys/routes.ts';
import { calendarRouter } from './features/calendar/routes.ts';
import { calendarFeedsRouter, calendarIcsRoutes } from './features/calendar-feeds/routes.ts';
import { eventsRouter } from './features/events/routes.ts';
import { lemonRouter } from './features/lemon/routes.ts';
import { memosRouter } from './features/memos/routes.ts';
import { moneyRouter } from './features/money/routes.ts';
import { pushRouter } from './features/push/routes.ts';
import { recordsRoutes } from './features/records/routes.ts';
import { timelineRouter } from './features/timeline/routes.ts';
import { meRouter, usersRouter } from './features/users/routes.ts';
import { weatherRouter } from './features/weather/routes.ts';
import { getAuth } from './lib/auth.ts';
import { pingDatabase } from './lib/db/health.ts';
import { domainErrorOf, INTERNAL_ERROR_MESSAGE } from './lib/errors.ts';
import { createContext, router } from './lib/trpc.ts';
import { mcpRoutes } from './mcp.ts';
import { qstashRoutes } from './qstash.ts';

/** better-auth 自身のエンドポイント（`/api/auth/*` と OAuth の探索メタデータ `/.well-known/*`） */
const authHandler: Handler = async (c) => (await getAuth()).handler(c.req.raw);

/**
 * 画面専用の API（tRPC。`lib/trpc.ts`）。互換性や REST としての形より通信の本数と量を優先する
 * （docs/architecture.md）。`AppRouter` をクライアント（src/lib/api.ts）が型として参照する。
 * 書き込みは値を返さない。画面は送った内容で先に書き換え、後で取り直して揃えるので、返しても読まれない。
 * 例外は API キーの発行で、キーそのものを見せられるのは発行の応答だけなので返す。
 */
const appRouter = router({
  me: meRouter,
  users: usersRouter,
  calendar: calendarRouter,
  events: eventsRouter,
  calendarFeeds: calendarFeedsRouter,
  apiKeys: apiKeysRouter,
  money: moneyRouter,
  lemon: lemonRouter,
  memos: memosRouter,
  timeline: timelineRouter,
  weather: weatherRouter,
  push: pushRouter,
});

export type AppRouter = typeof appRouter;

/** `/api` 配下。ルートの登録とミドルウェアの適用だけを行い、業務ロジックは各 feature の service に置く。 */
const api = new Hono().basePath('/api');

// 認証不要: ヘルスチェックと better-auth 自身のエンドポイント
api.get('/health', async (c) => {
  await pingDatabase();
  return c.json({ ok: true as const, db: true as const });
});
/**
 * 公開鍵の組（JWKS。`/api/auth/jwks`）は Vercel の CDN に持たせ、関数を起こさずに返す。
 * MCP のアクセストークンの検証（`requireMcpAuth`。server/mcp.ts）は鍵をこの URL から fetch する作りで、
 * 同じプロセスの中から渡す口が無い（受け取るのは http(s) の URL だけ）。インスタンスが起きるたびに
 * 自分へ取りに来るので、関数が応えると、呼ばれた側のインスタンスの起動まで待たされる。
 * 鍵は作り直さない限り変わらない（jwt プラグインの鍵の自動の入れ替えは使っていない。lib/auth.ts）ので、
 * 1 日持たせる。ブラウザ向けの Cache-Control（vercel.json の no-store）とは別の、Vercel の CDN だけが読む見出し。
 */
const cacheJwksOnCdn: MiddlewareHandler = async (c, next) => {
  await next();
  if (c.res.ok) c.header('Vercel-CDN-Cache-Control', 'max-age=86400, stale-while-revalidate=86400');
};
api.get('/auth/jwks', cacheJwksOnCdn);
api.on(['GET', 'POST'], '/auth/*', authHandler);
// MCP は OAuth のアクセストークンで保護する（セッションではない）
api.route('/mcp', mcpRoutes);
// ics の配信は URL のトークンだけを資格にする（購読するカレンダーは Cookie を送れない）。
// ログインの要らない口なので、`.ics` で終わるパスしか受けない（routes.ts の `:file` の制約）。
// 緩めると /calendar の下のほかのパスまでログイン無しで届くので、緩めてはいけない。
api.route('/calendar', calendarIcsRoutes);
// 記録投入用エンドポイントは API キーで保護する（デバイスや外部のサービスは Cookie を持てない）
api.route('/records', recordsRoutes);
// Vercel Cron の入口。Cron secret で保護する（セッションではない）
api.route('/cron', cronRoutes);
// QStash の配信コールバック。QStash の署名で保護する（セッションではない）
api.route('/qstash', qstashRoutes);

/**
 * 内容が変わっていなければ 304 を返す（HTTP の条件付き要求）。
 * 既定の staleTime は 0 で、画面を開くたびに取り直すため、変わっていない一覧（お金の記録、世話の記録、
 * カレンダーの 1 か月）をそのたびに丸ごと転送することになる。ETag を付ければブラウザが
 * If-None-Match を添えて聞き直し、同じなら本文が流れない。`private, no-cache` は「共有キャッシュには
 * 置かない・使う前に必ず確かめる」の意味で、常に最新を出す性質は変わらない。
 */
const cacheControl: MiddlewareHandler = async (c, next) => {
  await next();
  if (c.req.method === 'GET') c.header('Cache-Control', 'private, no-cache');
};
// 画面の API。ログインは手続きごとに確かめる（`lib/trpc.ts` の `authed`）
api.on(['GET', 'POST'], '/trpc/*', etag(), cacheControl, (c) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req: c.req.raw,
    router: appRouter,
    createContext: ({ req }) => createContext(req),
    // 想定外の失敗だけを出す（Sentry へ送られる。`lib/sentry.ts`）。業務エラーは `lib/trpc.ts` が種類を付けている
    onError: ({ error }) => {
      if (error.code === 'INTERNAL_SERVER_ERROR') console.error(error.cause ?? error);
    },
  }),
);

/**
 * 公開するアプリ本体。`/api` 配下に加えて、オリジン直下に置くことが仕様で決まっている
 * OAuth の探索メタデータ（RFC 8414 / RFC 9728 の `/.well-known/*`）をここで受ける。
 *
 * Vercel はオリジン直下を静的配信の領域として扱うので、`vercel.json` の rewrite で
 * この関数へ振り向ける（ローカルは vite の proxy）。rewrite でも関数が受け取る URL は
 * 元のパスのままなので、`/api` の下に移さず、来たパスをそのまま better-auth に渡す。
 */
export const app = new Hono()
  .onError((error, c) => {
    if (error instanceof HTTPException) return error.getResponse();
    const known = domainErrorOf(error);
    if (known) return c.json({ message: error.message }, known.status);
    console.error(error);
    return c.json({ message: INTERNAL_ERROR_MESSAGE }, 500);
  })
  .get('/.well-known/*', authHandler)
  .route('/', api);
