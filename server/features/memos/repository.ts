import { and, eq } from 'drizzle-orm';
import { db } from '../../lib/db.ts';
import { containsKeyword, timelineQueries } from '../../lib/history.ts';
import { memos } from './schema.ts';

/** タイムラインの問い合わせ。置く日時は書いた時刻、キーワードは本文の部分一致 */
export const timeline = timelineQueries({
  table: memos,
  at: memos.createdAt,
  keyword: (q) => containsKeyword(memos.body, q),
});

/**
 * メモを作る。id は呼び出し元（多くはクライアント）が決めたもの。
 * 同じ id で送り直されたら（オフラインで溜めた書き込みの再送）何も書かない（二重に作らない）。
 * WHY NOT 送られた値で上書き: 作った後に編集してから古い作成が再送されると、編集が巻き戻る。
 */
export async function insert(row: { id: string; body: string; createdBy: string }): Promise<void> {
  await db.insert(memos).values(row).onConflictDoNothing();
}

export async function exists(id: string): Promise<boolean> {
  const [row] = await db.select({ id: memos.id }).from(memos).where(eq(memos.id, id));
  return row !== undefined;
}

/** createdBy が書いたメモの本文を置き換える。書いた人と書いた時刻は変えない */
export async function update(id: string, createdBy: string, body: string): Promise<boolean> {
  const updated = await db
    .update(memos)
    .set({ body })
    .where(and(eq(memos.id, id), eq(memos.createdBy, createdBy)))
    .returning({ id: memos.id });
  return updated.length > 0;
}

/** createdBy が書いたメモを消す */
export async function remove(id: string, createdBy: string): Promise<boolean> {
  const deleted = await db
    .delete(memos)
    .where(and(eq(memos.id, id), eq(memos.createdBy, createdBy)))
    .returning({ id: memos.id });
  return deleted.length > 0;
}
