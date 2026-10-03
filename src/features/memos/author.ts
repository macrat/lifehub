import type { Memo } from '../../../shared/memos.ts';

/**
 * メモの書き手として出す名前。MCP で書いたメモは、書いた人の名前の代わりに MCP クライアントの名前を出す
 * （人は丸の色で分かるので、名前の欄は人の言葉か AI の書いたものかを見分けるのに使う）
 */
export function memoAuthorLabel(memo: Memo, authorName: (userId: string | null) => string) {
  return memo.mcpClientName ?? authorName(memo.createdBy);
}
