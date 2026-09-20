import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { eventsRoutes } from './features/events/routes.ts';
import { expensesRoutes } from './features/expenses/routes.ts';
import { lemonRoutes } from './features/lemon/routes.ts';
import { usersRoutes } from './features/users/routes.ts';
import { getUser } from './features/users/service.ts';
import type { AppEnv } from './lib/app-env.ts';
import { auth } from './lib/auth.ts';
import { db } from './lib/db.ts';
import { ConflictError, NotFoundError, ValidationError } from './lib/errors.ts';
import { mcpRoutes } from './lib/mcp/routes.ts';
import { requireSession } from './lib/middleware.ts';
import { notificationsRoutes } from './lib/notifications/routes.ts';
import { pushRoutes } from './lib/push/routes.ts';

/**
 * Hono アプリ本体。ルートの登録とミドルウェアの適用だけを行い、業務ロジックは各 feature の service に置く。
 * `AppType` を Hono RPC クライアント（src/lib/api.ts）が参照するため、ルートは必ずメソッドチェーンで登録する。
 */
export const app = new Hono<AppEnv>().basePath('/api');

app.onError((error, c) => {
  if (error instanceof HTTPException) return error.getResponse();
  if (error instanceof NotFoundError) return c.json({ message: error.message }, 404);
  if (error instanceof ConflictError) return c.json({ message: error.message }, 409);
  if (error instanceof ValidationError) return c.json({ message: error.message }, 400);
  console.error(error);
  return c.json({ message: 'サーバーエラーが発生しました' }, 500);
});

// 認証不要: ヘルスチェックと better-auth 自身のエンドポイント
app.get('/health', async (c) => {
  await db.execute(sql`select 1`);
  return c.json({ ok: true as const, db: true as const });
});
app.on(['GET', 'POST'], '/auth/*', (c) => auth.handler(c.req.raw));
// OAuth の探索メタデータはオリジン直下の /.well-known/* に置く必要がある。Vercel の rewrite と vite の
// proxy が /.well-known/* を /api/well-known/* に転送するので、元のパスに戻して better-auth に渡す。
app.get('/well-known/*', (c) => {
  const url = new URL(c.req.url);
  url.pathname = url.pathname.replace(/^\/api\/well-known\//, '/.well-known/');
  return auth.handler(new Request(url, c.req.raw));
});
// MCP は OAuth のアクセストークンで保護する（セッションではない）
app.route('/mcp', mcpRoutes);
// Cron secret と QStash の署名で保護する（セッションではない）
app.route('/notifications', notificationsRoutes);

// これ以降はすべてログイン必須
app.use('*', requireSession);

const routes = app
  // 色（hue）は better-auth のセッションに載らないので、users から読み直す
  .get('/me', async (c) => c.json(await getUser(c.get('user').id)))
  .route('/users', usersRoutes)
  .route('/events', eventsRoutes)
  .route('/expenses', expensesRoutes)
  .route('/lemon', lemonRoutes)
  .route('/push', pushRoutes);

export type AppType = typeof routes;
