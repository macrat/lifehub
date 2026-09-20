import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { calendarRoutes } from './features/calendar/routes.ts';
import { eventsRoutes } from './features/events/routes.ts';
import { tasksRoutes } from './features/tasks/routes.ts';
import { usersRoutes } from './features/users/routes.ts';
import type { AppEnv } from './lib/app-env.ts';
import { auth } from './lib/auth.ts';
import { db } from './lib/db.ts';
import { ConflictError, NotFoundError, ValidationError } from './lib/errors.ts';
import { requireSession } from './lib/middleware.ts';

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

// これ以降はすべてログイン必須
app.use('*', requireSession);

const routes = app
  .get('/me', (c) => {
    const user = c.get('user');
    return c.json({ id: user.id, name: user.name, email: user.email });
  })
  .route('/users', usersRoutes)
  .route('/events', eventsRoutes)
  .route('/tasks', tasksRoutes)
  .route('/calendar', calendarRoutes);

export type AppType = typeof routes;
