import { getTableName, is, sql } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { db } from './db.ts';
import * as schema from './schema.ts';

/**
 * テスト用: スキーマに定義された全テーブルを空にする。マイグレーション管理テーブルは残す。
 * 各テストファイルの beforeEach で呼び、テスト間の独立性を保つ。
 */
export async function truncateAll(): Promise<void> {
  const names = Object.values(schema)
    .filter((value) => is(value, PgTable))
    .map((table) => `"${getTableName(table)}"`);
  await db.execute(sql.raw(`truncate table ${names.join(', ')} restart identity cascade`));
}
