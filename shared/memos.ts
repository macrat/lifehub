import { compareKeys } from './sort.ts';

/**
 * メモ（一言の書き留め）。サーバーの応答と、クライアントの楽観的更新が同じ形を使うため、共通に置く。
 * 日時は書いた時刻（createdAt）だけを持ち、編集しても動かない（タイムラインの位置が変わらない）。
 */
export type Memo = {
  id: string;
  body: string;
  /**
   * 書いた人。サーバーの値はいつも持つ。null は画面が先回りで出したメモで、ログイン中のユーザーが
   * まだ手元に無いとき（取り直すと埋まる。レモンの記録の先回りと同じ）
   */
  createdBy: string | null;
  /** MCP で書いたメモの、書いた MCP クライアントの名前。画面で書いたメモは null */
  mcpClientName: string | null;
  createdAt: string;
  /** ピン止めしたか。ピン止めしたメモはホームのタイムラインの一番上に固定して出す */
  pinned: boolean;
};

/**
 * ピン止めしたメモの並び: 書いた時刻の新しい順（同じ時刻は id の順）。サーバーの読み出しと、
 * クライアントの楽観的更新が同じ並びにするため、共通に置く。
 */
export function sortPinnedMemos(memos: Memo[]): Memo[] {
  return memos.toSorted((a, b) => compareKeys(b.createdAt, a.createdAt) || compareKeys(b.id, a.id));
}
