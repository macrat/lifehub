import SmartToyIcon from '@mui/icons-material/SmartToy';
import type { Memo } from '../../../shared/memos.ts';

/**
 * MCP で書いたメモの、タイムラインの左の丸のアイコン（AI が書いたことを示す）。
 * 丸の色は画面で書いたメモと同じく書いた人（MCP の認可をしたユーザー）の色で、誰の AI かが分かる
 */
export const MCP_MEMO_ICON = SmartToyIcon;

/**
 * メモの書き手として出す名前。MCP で書いたメモは、書いた人の名前の代わりに MCP クライアントの名前を出す
 * （人は丸の色で分かるので、名前の欄は人の言葉か AI の書いたものかを見分けるのに使う）
 */
export function memoAuthorLabel(memo: Memo, authorName: (userId: string | null) => string) {
  return memo.mcpClientName ?? authorName(memo.createdBy);
}
