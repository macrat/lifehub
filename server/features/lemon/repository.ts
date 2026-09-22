import { desc, eq, lte, sql } from 'drizzle-orm';
import type { CareType } from '../../../shared/validation/lemon.ts';
import { db } from '../../lib/db.ts';
import { type LemonCareLogRow, lemonCareLogs } from './schema.ts';

export async function findAll(): Promise<LemonCareLogRow[]> {
  return db
    .select()
    .from(lemonCareLogs)
    .orderBy(desc(lemonCareLogs.doneAt), desc(lemonCareLogs.createdAt));
}

/**
 * 項目ごとの、いちばん新しい実施記録（未来の記録は「まだ実施していない」ので除く）。
 * 状態はこれだけで決まるので、行を全部読まずに DB で 1 項目 1 行に絞る。
 * 1 件の記録が複数の項目を持つので、まず unnest で 1 項目 1 行にほどいてから DISTINCT ON で絞る。
 */
export async function findLatestByCareType(
  now: Date,
): Promise<{ careType: CareType; doneAt: Date }[]> {
  const unnested = db
    .select({
      careType: sql<CareType>`unnest(${lemonCareLogs.careTypes})`.as('care_type'),
      doneAt: lemonCareLogs.doneAt,
    })
    .from(lemonCareLogs)
    .where(lte(lemonCareLogs.doneAt, now))
    .as('care');

  return db
    .selectDistinctOn([unnested.careType], {
      careType: unnested.careType,
      doneAt: unnested.doneAt,
    })
    .from(unnested)
    .orderBy(unnested.careType, desc(unnested.doneAt));
}

/**
 * 世話の記録を作る。id は呼び出し元（多くはクライアント）が決めたもの。
 * 同じ id で送り直されたら（オフラインで溜めた書き込みの再送）同じ値を書き直すだけにして、二重に作らない。
 */
export async function insert(row: {
  id: string;
  careTypes: CareType[];
  doneAt: Date;
  note: string | null;
  createdBy: string;
}): Promise<LemonCareLogRow> {
  const inserted = await db
    .insert(lemonCareLogs)
    .values(row)
    .onConflictDoUpdate({ target: lemonCareLogs.id, set: row })
    .returning();
  const log = inserted[0];
  if (!log) throw new Error('insert returned no row');
  return log;
}

/** 全項目を置き換える。記録した人（createdBy）は変えない */
export async function update(
  id: string,
  row: { careTypes: CareType[]; doneAt: Date; note: string | null },
): Promise<LemonCareLogRow | undefined> {
  const updated = await db
    .update(lemonCareLogs)
    .set(row)
    .where(eq(lemonCareLogs.id, id))
    .returning();
  return updated[0];
}

export async function remove(id: string): Promise<boolean> {
  const deleted = await db
    .delete(lemonCareLogs)
    .where(eq(lemonCareLogs.id, id))
    .returning({ id: lemonCareLogs.id });
  return deleted.length > 0;
}
