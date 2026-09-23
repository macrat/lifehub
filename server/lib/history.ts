import { type Column, ilike, type SQL } from 'drizzle-orm';

/**
 * 履歴（立替・レモンの記録）の 1 ページの件数の目安。ページは日の途中では切らないので、
 * これより多くなることがある。1 日は数件なので、スマホの画面数枚分になる
 */
export const HISTORY_PAGE_SIZE = 50;

/**
 * キーワードの部分一致（大文字小文字を区別しない）。画面の検索窓と同じ規則で、
 * LIKE の記号（% と _）は文字として扱う。空のキーワードは条件にしない
 */
export function containsKeyword(column: Column, keyword: string | undefined): SQL | undefined {
  const q = keyword?.trim();
  return q ? ilike(column, `%${q.replace(/[\\%_]/g, '\\$&')}%`) : undefined;
}
