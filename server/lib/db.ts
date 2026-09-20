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
