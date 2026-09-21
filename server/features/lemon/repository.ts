import { and, desc, eq, inArray, lte } from 'drizzle-orm';
import { type CareType, TRACKED_CARE_TYPES } from '../../../shared/validation/lemon.ts';
import { db } from '../../lib/db.ts';
import { newId } from '../../lib/id.ts';
import { type LemonCareLogRow, lemonCareLogs } from './schema.ts';

export async function findAll(): Promise<LemonCareLogRow[]> {
  return db
    .select()
    .from(lemonCareLogs)
    .orderBy(desc(lemonCareLogs.doneAt), desc(lemonCareLogs.createdAt));
}

/**
 * 経過日数を出す種別ごとの、いちばん新しい実施記録（未来の記録は「まだ実施していない」ので除く）。
 * 状態はこれだけで決まるので、行を全部読まずに DB で 1 種別 1 行に絞る。
 */
export async function findLatestByCareType(
  now: Date,
): Promise<{ careType: CareType; doneAt: Date }[]> {
  return db
    .selectDistinctOn([lemonCareLogs.careType], {
      careType: lemonCareLogs.careType,
      doneAt: lemonCareLogs.doneAt,
    })
    .from(lemonCareLogs)
    .where(
      and(inArray(lemonCareLogs.careType, [...TRACKED_CARE_TYPES]), lte(lemonCareLogs.doneAt, now)),
    )
    .orderBy(lemonCareLogs.careType, desc(lemonCareLogs.doneAt), desc(lemonCareLogs.createdAt));
}

export async function insert(row: {
  careType: CareType;
  doneAt: Date;
  note: string | null;
  createdBy: string;
}): Promise<LemonCareLogRow> {
  const inserted = await db
    .insert(lemonCareLogs)
    .values({ ...row, id: newId() })
    .returning();
  const log = inserted[0];
  if (!log) throw new Error('insert returned no row');
  return log;
}

/** 全項目を置き換える。記録した人（createdBy）は変えない */
export async function update(
  id: string,
  row: { careType: CareType; doneAt: Date; note: string | null },
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
