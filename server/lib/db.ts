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
 *
 * HTTP ドライバは問い合わせ 1 回が HTTP の往復 1 回になる。応答時間は往復の回数でほぼ決まるので、
 * 読み取りは 1 エンドポイント 1 問い合わせに寄せ、複数文の書き込みは `runBatch` にまとめる。
 */
function createDatabase(): Database {
  if (env.VERCEL) {
    return drizzleNeon(neon(env.DATABASE_URL), { schema });
  }
  return drizzleNodePg(env.DATABASE_URL, { schema });
}

export const db: Database = createDatabase();

type BatchQuery = Promise<unknown>;
type BatchQueries = [BatchQuery, ...BatchQuery[]];

type Batchable = { batch: (queries: BatchQueries) => Promise<unknown> };

function supportsBatch(database: Database): database is Database & Batchable {
  return 'batch' in database && typeof database.batch === 'function';
}

/**
 * 複数の文を原子的に、できるだけ少ない往復で実行する。
 *
 * neon-http は対話的トランザクションを持たない代わりに `db.batch()` が全文を 1 回の HTTP 要求で
 * 1 つのトランザクションとして実行する。node-postgres（ローカル・CI・テスト）にはそれが無いので
 * 明示的なトランザクションで包む。どちらでも「全部通るか、何も残らないか」になる。
 *
 * 問い合わせはトランザクションに属するセッションから作らなければならないため、組み立てた配列では
 * なく組み立てる関数を受け取る（Drizzle のクエリビルダは作られたセッションの上で実行される）。
 */
export async function runBatch(build: (tx: Database) => BatchQueries): Promise<void> {
  if (supportsBatch(db)) {
    await db.batch(build(db));
    return;
  }
  await db.transaction(async (tx) => {
    for (const query of build(tx)) await query;
  });
}
