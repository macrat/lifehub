import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { env } from './env.ts';
import * as schema from './schema.ts';

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * Vercel 上では Neon の HTTP ドライバ（接続を持たずサーバーレスに向く）、
 * ローカル・CI では node-postgres（compose.yaml の Postgres に TCP 接続）を使う。
 * どちらも同じ Drizzle スキーマを共有するので、呼び出し側は差を意識しない。
 */
function createDatabase(): Database {
  if (env.VERCEL) {
    return drizzleNeon(neon(env.DATABASE_URL), { schema });
  }
  return drizzleNodePg(env.DATABASE_URL, { schema });
}

export const db: Database = createDatabase();

type BatchQuery = Promise<unknown>;

/**
 * 複数の文を原子的に実行する。neon-http は対話的トランザクションを持たないため `db.batch()` を使う。
 * node-postgres（ローカル・テスト）には batch が無いので順次実行する（原子性はローカルでは保証しない）。
 * 呼び出し側は未実行のクエリビルダを渡す（Drizzle のクエリは await されるまで実行されない）。
 */
export async function runBatch(queries: [BatchQuery, ...BatchQuery[]]): Promise<void> {
  if ('batch' in db && typeof db.batch === 'function') {
    await (db.batch as (q: [BatchQuery, ...BatchQuery[]]) => Promise<unknown>)(queries);
    return;
  }
  for (const query of queries) await query;
}
