import { z } from 'zod';

/** キーワード検索をする画面の検索パラメータ。空文字は付けない（検索していない状態は URL にも残さない） */
export const keywordSearchSchema = z.object({ q: z.string().optional() });

/**
 * キーワードが text のどれかに部分一致するか（大文字小文字は区別しない）。空のキーワードはすべてに一致する。
 * 2 人分の記録しかなく一覧は既に手元にあるので、サーバーに検索を投げず絞り込みは手元で掛ける（打つたびに取り直さない）。
 */
export function matchesKeyword(keyword: string, ...texts: (string | null | undefined)[]): boolean {
  const q = keyword.trim().toLowerCase();
  return q === '' || texts.some((text) => text?.toLowerCase().includes(q));
}
