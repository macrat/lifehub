import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from './lib/db.ts';

/**
 * Hono アプリ本体。ルートの登録とミドルウェアの適用だけを行い、業務ロジックは各 feature の service に置く。
 * `AppType` を Hono RPC クライアント（src/lib/api.ts）が参照するため、ルートは必ずメソッドチェーンで登録する。
 */
export const app = new Hono().basePath('/api');

const routes = app.get('/health', async (c) => {
  await db.execute(sql`select 1`);
  return c.json({ ok: true as const, db: true as const });
});

export type AppType = typeof routes;
