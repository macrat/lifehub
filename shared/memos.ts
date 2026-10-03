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
};
