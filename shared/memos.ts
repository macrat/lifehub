/**
 * メモ（一言の書き留め）。サーバーの応答と、クライアントの楽観的更新が同じ形を使うため、共通に置く。
 * 日時は書いた時刻（createdAt）だけを持ち、編集しても動かない（タイムラインの位置が変わらない）。
 */
export type Memo = {
  id: string;
  body: string;
  /** 書いた人 */
  createdBy: string;
  createdAt: string;
};
