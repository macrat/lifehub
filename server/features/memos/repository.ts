import { and, eq } from 'drizzle-orm';
import { db } from '../../lib/db/client.ts';
import { containsKeyword, insertOnce } from '../../lib/db/query.ts';
import { timelineQueries } from '../../lib/db/timeline.ts';
import { type MemoRow, memos } from './schema.ts';

/** タイムラインの問い合わせ。置く日時は書いた時刻、キーワードは本文の部分一致 */
export const timeline = timelineQueries({
  table: memos,
  at: memos.createdAt,
  keyword: (q) => containsKeyword(memos.body, q),
});

/** ピン止めしていないメモだけのタイムラインの問い合わせ（絞り込んでいないホームのタイムライン） */
export const unpinnedTimeline = timelineQueries({
  table: memos,
  at: memos.createdAt,
  keyword: (q) => and(eq(memos.pinned, false), containsKeyword(memos.body, q)),
});

/** メモを作る。同じ id で送り直されたら何も書かず、今の行を返す（`insertOnce`） */
export async function insert(row: {
  id: string;
  body: string;
  createdBy: string;
}): Promise<MemoRow> {
  return insertOnce(memos, row);
}

export async function exists(id: string): Promise<boolean> {
  const [row] = await db.select({ id: memos.id }).from(memos).where(eq(memos.id, id));
  return row !== undefined;
}

/** createdBy が書いたメモの本文を置き換える（置き換えた行を返す）。書いた人と書いた時刻は変えない */
export async function update(
  id: string,
  createdBy: string,
  body: string,
): Promise<MemoRow | undefined> {
  const [updated] = await db
    .update(memos)
    .set({ body })
    .where(and(eq(memos.id, id), eq(memos.createdBy, createdBy)))
    .returning();
  return updated;
}

/** メモのピン止めを変える（メモがあったか）。誰が書いたメモでも変えられる */
export async function setPinned(id: string, pinned: boolean): Promise<boolean> {
  const updated = await db
    .update(memos)
    .set({ pinned })
    .where(eq(memos.id, id))
    .returning({ id: memos.id });
  return updated.length > 0;
}

/** ピン止めしたメモ。並びは問わない（service が `sortPinnedMemos` で並べる） */
export async function findPinned(): Promise<MemoRow[]> {
  return db.select().from(memos).where(eq(memos.pinned, true));
}

/** createdBy が書いたメモを消す */
export async function remove(id: string, createdBy: string): Promise<boolean> {
  const deleted = await db
    .delete(memos)
    .where(and(eq(memos.id, id), eq(memos.createdBy, createdBy)))
    .returning({ id: memos.id });
  return deleted.length > 0;
}
