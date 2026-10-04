/**
 * キーワードが text のどれかに部分一致するか（大文字小文字は区別しない）。空のキーワードはすべてに一致する。
 * 読んだ分が手元にある一覧（カレンダーのリスト表示）が打つたびに取り直さずに手元で絞り込むのと、
 * サーバーが展開した予定・タスク（ホームのタイムライン）を絞り込むのに使う。
 * DB の行を絞り込むときは同じ規則を SQL で掛ける（server/lib/db/query.ts の `containsKeyword`）。
 */
export function matchesKeyword(
  keyword: string | undefined,
  ...texts: (string | null | undefined)[]
): boolean {
  const q = keyword?.trim().toLowerCase() ?? '';
  return q === '' || texts.some((text) => text?.toLowerCase().includes(q));
}

/**
 * 絞り込みの条件が 1 つでも入っているか（undefined でない値があるか）。条件を足しても判定を直さずに済むよう、
 * 項目の名前では見ない。空のキーワードは画面が条件から落とす（`src/lib/search.ts` の `toListFilter`）。
 */
export function isFiltered(filter: object): boolean {
  return Object.values(filter).some((value) => value !== undefined);
}
