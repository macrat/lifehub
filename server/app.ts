import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { etag } from 'hono/etag';
import { HTTPException } from 'hono/http-exception';
import { cronRoutes } from './cron.ts';
import { apiKeysRoutes } from './features/api-keys/routes.ts';
import { calendarRoutes } from './features/calendar/routes.ts';
import { calendarFeedsRoutes, calendarIcsRoutes } from './features/calendar-feeds/routes.ts';
import { eventsRoutes } from './features/events/routes.ts';
import { expensesRoutes } from './features/expenses/routes.ts';
import { lemonRoutes } from './features/lemon/routes.ts';
import { memosRoutes } from './features/memos/routes.ts';
import { pushRoutes } from './features/push/routes.ts';
import { recordsRoutes } from './features/records/routes.ts';
import { timelineRoutes } from './features/timeline/routes.ts';
import { meRoutes, usersRoutes } from './features/users/routes.ts';
import type { AppEnv } from './lib/app-env.ts';
import { auth } from './lib/auth.ts';
import { db } from './lib/db.ts';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './lib/errors.ts';
import { requireSession } from './lib/middleware.ts';
import { mcpRoutes } from './mcp.ts';
import { qstashRoutes } from './qstash.ts';

/**
 * `/api` 配下。ルートの登録とミドルウェアの適用だけを行い、業務ロジックは各 feature の service に置く。
 * `AppType` を Hono RPC クライアント（src/lib/api.ts）が参照するため、ルートは必ずメソッドチェーンで登録する。
 */
const api = new Hono<AppEnv>().basePath('/api');

// 認証不要: ヘルスチェックと better-auth 自身のエンドポイント
api.get('/health', async (c) => {
  await db.execute(sql`select 1`);
  return c.json({ ok: true as const, db: true as const });
});
api.on(['GET', 'POST'], '/auth/*', (c) => auth.handler(c.req.raw));
// MCP は OAuth のアクセストークンで保護する（セッションではない）
api.route('/mcp', mcpRoutes);
// ics の配信は URL のトークンだけを資格にする（購読するカレンダーは Cookie を送れない）。
// この下の /calendar と /calendar/feeds はログイン必須のままにしたいので、ics 側は `.ics` で終わるパスしか
// 受けない（routes.ts の `:file` の制約）。その制約が両者を分けているので、緩めてはいけない。
api.route('/calendar', calendarIcsRoutes);
// 記録投入用エンドポイントは API キーで保護する（デバイスや外部のサービスは Cookie を持てない）
api.route('/records', recordsRoutes);
// Vercel Cron の入口。Cron secret で保護する（セッションではない）
api.route('/cron', cronRoutes);
// QStash の配信コールバック。QStash の署名で保護する（セッションではない）
api.route('/qstash', qstashRoutes);

// これ以降はすべてログイン必須
api.use('*', requireSession);

/**
 * 内容が変わっていなければ 304 を返す（HTTP の条件付き要求）。
 * 既定の staleTime は 0 で、画面を開くたびに取り直すため、変わっていない一覧（立替の履歴、世話の記録、
 * カレンダーの 1 か月）をそのたびに丸ごと転送することになる。ETag を付ければブラウザが
 * If-None-Match を添えて聞き直し、同じなら本文が流れない。`private, no-cache` は「共有キャッシュには
 * 置かない・使う前に必ず確かめる」の意味で、常に最新を出す性質は変わらない。
 */
api.use('*', etag());
api.use('*', async (c, next) => {
  await next();
  if (c.req.method === 'GET') c.header('Cache-Control', 'private, no-cache');
});

/**
 * 画面専用の API。互換性や REST としての形より通信の本数と量を優先する（docs/architecture.md）。
 * 書き込みは本文を返さない（204）。画面は送った内容で先に書き換え、後で取り直して揃えるので、
 * 返しても読まれない（`src/lib/api.ts` の `sendWrite` は本文を読まない）。例外は API キーの発行で、
 * キーそのものを見せられるのは発行の応答だけなので本文で返す。
 */
const routes = api
  .route('/me', meRoutes)
  .route('/users', usersRoutes)
  .route('/calendar', calendarRoutes)
  .route('/events', eventsRoutes)
  .route('/calendar/feeds', calendarFeedsRoutes)
  .route('/api-keys', apiKeysRoutes)
  .route('/expenses', expensesRoutes)
  .route('/lemon', lemonRoutes)
  .route('/memos', memosRoutes)
  .route('/timeline', timelineRoutes)
  .route('/push', pushRoutes);

export type AppType = typeof routes;

/**
 * 公開するアプリ本体。`/api` 配下に加えて、オリジン直下に置くことが仕様で決まっている
 * OAuth の探索メタデータ（RFC 8414 / RFC 9728 の `/.well-known/*`）をここで受ける。
 *
 * Vercel はオリジン直下を静的配信の領域として扱うので、`vercel.json` の rewrite で
 * この関数へ振り向ける（ローカルは vite の proxy）。rewrite でも関数が受け取る URL は
 * 元のパスのままなので、`/api` の下に移さず、来たパスをそのまま better-auth に渡す。
 */
export const app = new Hono<AppEnv>()
  .onError((error, c) => {
    if (error instanceof HTTPException) return error.getResponse();
    if (error instanceof ForbiddenError) return c.json({ message: error.message }, 403);
    if (error instanceof NotFoundError) return c.json({ message: error.message }, 404);
    if (error instanceof ConflictError) return c.json({ message: error.message }, 409);
    if (error instanceof ValidationError) return c.json({ message: error.message }, 400);
    console.error(error);
    return c.json({ message: 'サーバーエラーが発生しました' }, 500);
  })
  .get('/.well-known/*', (c) => auth.handler(c.req.raw))
  .route('/', api);
