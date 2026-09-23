import { and, arrayContains, asc, desc, eq, gte, lt, lte, type SQL, sql } from 'drizzle-orm';
import { addDays, startOfDate, toDateString } from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';
import type { CareLogFilter, CareType } from '../../../shared/validation/lemon.ts';
import { db } from '../../lib/db.ts';
import { containsKeyword } from '../../lib/history.ts';
import { type LemonCareLogRow, lemonCareLogs } from './schema.ts';

/**
 * before（JST の暦日）より前（省けば全体）の、新しいほうから limit 件ほどの記録（古い順）。
 * 最も古い日（実施日時の JST の暦日）の途中では切らず、その日の記録はすべて入れる
 * （件数は limit より多くなりうる。日で切る理由は shared/types.ts の `HistoryPage`）。
 * olderThan は、このページより前にまだ記録があるときの次の境目（このページの最も古い日）。
 */
export async function findPage(
  filter: CareLogFilter,
  before: DateString | undefined,
  limit: number,
): Promise<{ rows: LemonCareLogRow[]; olderThan: DateString | null }> {
  const conditions = [
    ...filterConditions(filter),
    before !== undefined ? lt(lemonCareLogs.doneAt, startOfDate(before)) : undefined,
  ];
  // 新しいほうから数えて limit 件目の記録の日。その日の 0:00 からをこのページにする
  const [boundaryRow] = await db
    .select({ doneAt: lemonCareLogs.doneAt })
    .from(lemonCareLogs)
    .where(and(...conditions))
    .orderBy(desc(lemonCareLogs.doneAt), desc(lemonCareLogs.createdAt))
    .offset(limit - 1)
    .limit(1);
  const boundary = boundaryRow && toDateString(boundaryRow.doneAt);
  const start = boundary && startOfDate(boundary);
  // このページの行と、それより前がまだあるかは互いに依らないので同時に聞く
  const [rows, older] = await Promise.all([
    db
      .select()
      .from(lemonCareLogs)
      .where(and(...conditions, start && gte(lemonCareLogs.doneAt, start)))
      .orderBy(asc(lemonCareLogs.doneAt), asc(lemonCareLogs.createdAt), asc(lemonCareLogs.id)),
    start
      ? db
          .select({ id: lemonCareLogs.id })
          .from(lemonCareLogs)
          .where(and(...conditions, lt(lemonCareLogs.doneAt, start)))
          .limit(1)
      : [],
  ]);
  return { rows, olderThan: boundary && older.length > 0 ? boundary : null };
}

/**
 * 絞り込みの条件。記録が持つのは瞬間（doneAt）なので、日付の範囲は JST の暦日の 0:00 で区切って比べる
 * （範囲は両端を含む）。キーワードはメモの部分一致
 */
function filterConditions(f: CareLogFilter): (SQL | undefined)[] {
  return [
    containsKeyword(lemonCareLogs.note, f.q),
    f.kind !== undefined ? arrayContains(lemonCareLogs.careTypes, [f.kind]) : undefined,
    f.since !== undefined ? gte(lemonCareLogs.doneAt, startOfDate(f.since)) : undefined,
    f.until !== undefined ? lt(lemonCareLogs.doneAt, startOfDate(addDays(f.until, 1))) : undefined,
  ];
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
