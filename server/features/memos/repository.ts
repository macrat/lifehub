import { eq, type SQL } from 'drizzle-orm';
import { db } from '../../lib/db/client.ts';
import {
  containsKeyword,
  deleteById,
  findById,
  insertOnce,
  updateById,
} from '../../lib/db/query.ts';
import { timelineQueries } from '../../lib/db/timeline.ts';
import { type MemoRow, memos } from './schema.ts';

/** タイムラインの問い合わせ。置く日時は書いた時刻、キーワードは本文の部分一致 */
const timelineOf = (where?: SQL) =>
  timelineQueries({
    table: memos,
    at: memos.createdAt,
    keyword: (q) => containsKeyword(memos.body, q),
    where,
  });

export const timeline = timelineOf();

/** ピン止めしていないメモだけのタイムラインの問い合わせ（絞り込んでいないホームのタイムライン） */
export const unpinnedTimeline = timelineOf(eq(memos.pinned, false));

/** メモを作る。同じ id で送り直されたら何も書かず、今の行を返す（`insertOnce`） */
export async function insert(row: {
  id: string;
  body: string;
  createdBy: string;
  mcpClientName: string | null;
}): Promise<MemoRow> {
  return insertOnce(memos, row);
}

export async function exists(id: string): Promise<boolean> {
  return (await findById(memos, id)) !== undefined;
}

/** createdBy が書いたメモの本文を置き換える（置き換えた行を返す）。書いた人・書いた MCP クライアント・書いた時刻は変えない */
export async function update(
  id: string,
  createdBy: string,
  body: string,
): Promise<MemoRow | undefined> {
  return updateById(memos, id, { body }, eq(memos.createdBy, createdBy));
}

/** メモのピン止めを変える（メモがあったか）。誰が書いたメモでも変えられる */
export async function setPinned(id: string, pinned: boolean): Promise<boolean> {
  return (await updateById(memos, id, { pinned })) !== undefined;
}

/** ピン止めしたメモ。並びは問わない（service が `sortPinnedMemos` で並べる） */
export async function findPinned(): Promise<MemoRow[]> {
  return db.select().from(memos).where(eq(memos.pinned, true));
}

/** createdBy が書いたメモを消す。消した行を返す（無ければ undefined） */
export async function remove(id: string, createdBy: string): Promise<MemoRow | undefined> {
  return deleteById(memos, id, eq(memos.createdBy, createdBy));
}
