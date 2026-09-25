/**
 * キーワードが text のどれかに部分一致するか（大文字小文字は区別しない）。空のキーワードはすべてに一致する。
 * 読んだ分が手元にある一覧（カレンダーのリスト表示）が打つたびに取り直さずに手元で絞り込むのと、
 * サーバーが展開した予定・タスク（ホームのタイムライン）を絞り込むのに使う。
 * DB の行を絞り込むときは同じ規則を SQL で掛ける（server/lib/history.ts の `containsKeyword`）。
 */
export function matchesKeyword(
  keyword: string | undefined,
  ...texts: (string | null | undefined)[]
): boolean {
  const q = keyword?.trim().toLowerCase() ?? '';
  return q === '' || texts.some((text) => text?.toLowerCase().includes(q));
}
