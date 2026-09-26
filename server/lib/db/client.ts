import { neon } from '@neondatabase/serverless';
import { type SQL, sql } from 'drizzle-orm';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import type { PgColumn, PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { env } from '../env.ts';
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

/**
 * ID の配列を 1 行に 1 つずつ展開する列（`insert ... select` で子テーブルの行を作るのに使う）。
 * 親の行を where で引き当てて select し、その行ごとに ID の数だけ行を作る。親の ID を手元に持たない書き込み
 * （回の実体化）や、「親を作れたときだけ」入れる書き込み（where に条件を足す）で、親の行と同じ batch に入れられる。
 */
export function unnestIds(ids: string[], alias: string): SQL.Aliased<string> {
  return sql<string>`unnest(${sql.param(ids)}::uuid[])`.as(alias);
}

/**
 * 結合した子テーブルの ID を配列にまとめる（参加者のような多対多の相手）。
 * left join と組にすると、子が 0 件でも親の行が消えない。
 * uuid[] のままだとドライバによって受け取り方が変わるので text[] にして返す。
 */
export function idArrayAgg(column: PgColumn): SQL<string[]> {
  return sql`coalesce(array_agg(${column}::text) filter (where ${column} is not null), '{}')`;
}
