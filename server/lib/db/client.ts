import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { env } from '../env.ts';
import { traceNeonFetch } from '../sentry.ts';
import { coalesceReads } from './coalesce-reads.ts';
import * as schema from './schema.ts';

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * Vercel 上では Neon の HTTP ドライバ（接続を持たずサーバーレスに向く）、
 * ローカル・CI では node-postgres（compose.yaml の Postgres に TCP 接続）を使う。
 * どちらも同じ Drizzle スキーマを共有するので、呼び出し側は差を意識しない。
 *
 * HTTP ドライバは問い合わせ 1 回が HTTP の往復 1 回になる。応答時間は往復の回数でほぼ決まるので、
 * 同じ時点に投げた読み取りは 1 往復にまとめて送り（`coalesceReads`）、複数文の書き込みは `runBatch` にまとめる。
 * Neon への問い合わせは、SQL 文を Sentry のトレースに残すため fetch を包む（`traceNeonFetch`）。
 */
function createDatabase(): Database {
  if (env.VERCEL) {
    neonConfig.fetchFunction = traceNeonFetch;
    return drizzleNeon(coalesceReads(neon(env.DATABASE_URL)), { schema });
  }
  return drizzleNodePg(env.DATABASE_URL, { schema });
}

export const db: Database = createDatabase();

type BatchQuery = Promise<unknown>;
type BatchQueries = readonly [BatchQuery, ...BatchQuery[]];
/** 各文の結果（`returning` の行など）。文と同じ並び */
type BatchResults<T extends BatchQueries> = { -readonly [K in keyof T]: Awaited<T[K]> };

type Batchable = { batch: (queries: BatchQueries) => Promise<unknown[]> };

function supportsBatch(database: Database): database is Database & Batchable {
  return 'batch' in database && typeof database.batch === 'function';
}

/**
 * 複数の文を原子的に、できるだけ少ない往復で実行し、各文の結果を並びのまま返す。
 *
 * neon-http は対話的トランザクションを持たない代わりに `db.batch()` が全文を 1 回の HTTP 要求で
 * 1 つのトランザクションとして実行する。node-postgres（ローカル・CI・テスト）にはそれが無いので
 * 明示的なトランザクションで包む。どちらでも「全部通るか、何も残らないか」になる。
 * 結果を返すので、「書けたかどうか」（`returning` の行の有無）を読み直しの往復なしに判定できる。
 *
 * 問い合わせはトランザクションに属するセッションから作らなければならないため、組み立てた配列では
 * なく組み立てる関数を受け取る（Drizzle のクエリビルダは作られたセッションの上で実行される）。
 */
export async function runBatch<const T extends BatchQueries>(
  build: (tx: Database) => T,
): Promise<BatchResults<T>> {
  if (supportsBatch(db)) {
    return (await db.batch(build(db))) as BatchResults<T>;
  }
  return db.transaction(async (tx) => {
    const results: unknown[] = [];
    for (const query of build(tx)) results.push(await query);
    return results as BatchResults<T>;
  });
}
