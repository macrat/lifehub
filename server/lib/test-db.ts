import { getTableName, is, sql } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { createUser } from '../features/users/service.ts';
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

/**
 * テスト用: ユーザーを作って ID を返す。A は自分、B は相手として使う（立替の残高は登録順の先頭 2 人で
 * 計算するので、A → B の順に作る）。名前・メール・パスワードそのものを確かめるテストでは使わない。
 */
export async function createTestUser(name: 'A' | 'B'): Promise<string> {
  const email = `${name.toLowerCase()}@example.com`;
  return (await createUser({ email, name, password: 'password-123456' })).id;
}
