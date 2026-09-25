import { and, desc, eq, gte, lt } from 'drizzle-orm';
import { db } from '../../lib/db.ts';
import { containsKeyword, type InstantRange } from '../../lib/history.ts';
import { type MemoRow, memos } from './schema.ts';

/** 書いた時刻が before より前の、新しいほうから limit 件の書いた時刻（タイムラインのページ分け） */
export async function findRecentTimelineInstants(
  before: Date,
  q: string | undefined,
  limit: number,
): Promise<Date[]> {
  const rows = await db
    .select({ at: memos.createdAt })
    .from(memos)
    .where(and(lt(memos.createdAt, before), containsKeyword(memos.body, q)))
    .orderBy(desc(memos.createdAt))
    .limit(limit);
  return rows.map((row) => row.at);
}

/** 書いた時刻が [from, to) のメモ */
export async function findInTimelineRange(
  range: InstantRange,
  q: string | undefined,
): Promise<MemoRow[]> {
  return db
    .select()
    .from(memos)
    .where(
      and(
        gte(memos.createdAt, range.from),
        lt(memos.createdAt, range.to),
        containsKeyword(memos.body, q),
      ),
    );
}

/**
 * メモを作る。id は呼び出し元（多くはクライアント）が決めたもの。
 * 同じ id で送り直されたら（オフラインで溜めた書き込みの再送）何も書かない（二重に作らない）。
 * WHY NOT 送られた値で上書き: 作った後に編集してから古い作成が再送されると、編集が巻き戻る。
 */
export async function insert(row: { id: string; body: string; createdBy: string }): Promise<void> {
  await db.insert(memos).values(row).onConflictDoNothing();
}

/** メモを書いた人。メモが無ければ undefined */
export async function findCreator(id: string): Promise<string | undefined> {
  const [row] = await db.select({ createdBy: memos.createdBy }).from(memos).where(eq(memos.id, id));
  return row?.createdBy;
}

/** 本文を置き換える。書いた人と書いた時刻は変えない */
export async function update(id: string, body: string): Promise<boolean> {
  const updated = await db
    .update(memos)
    .set({ body })
    .where(eq(memos.id, id))
    .returning({ id: memos.id });
  return updated.length > 0;
}

export async function remove(id: string): Promise<boolean> {
  const deleted = await db.delete(memos).where(eq(memos.id, id)).returning({ id: memos.id });
  return deleted.length > 0;
}
