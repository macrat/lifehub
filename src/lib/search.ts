import { useState } from 'react';
import { z } from 'zod';

/** キーワード検索をする画面の検索パラメータ。空文字は付けない（検索していない状態は URL にも残さない） */
export const keywordSearchSchema = z.object({ q: z.string().optional() });

/**
 * 検索キーワードの状態。初期値は URL の q（再読み込みや共有で絞り込みが戻る）。
 *
 * 打つたびの反映は router の navigate ではなく history.replaceState で URL を差し替えるだけにする。
 * 表示する値は手元の状態なので、入力してから画面に出るまでが同じ描画で完結する。
 * navigate だと入力 → URL → 再描画と非同期に往復し、その間の書き戻しで IME の変換が切れる。
 * 履歴には積まない（1 文字ごとに戻る先が増えると、戻る操作が打ち直しの巻き戻しになる）。
 */
export function useKeywordSearch(initial: string) {
  const [keyword, setKeyword] = useState(initial);

  const change = (next: string) => {
    setKeyword(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set('q', next);
    else url.searchParams.delete('q');
    // state はそのまま持ち越す（履歴の項目に付いた鍵を保ち、スクロール位置の復元を壊さない）
    window.history.replaceState(window.history.state, '', url);
  };

  return [keyword, change] as const;
}

/**
 * キーワードが text のどれかに部分一致するか（大文字小文字は区別しない）。空のキーワードはすべてに一致する。
 * 2 人分の記録しかなく一覧は既に手元にあるので、サーバーに検索を投げず絞り込みは手元で掛ける（打つたびに取り直さない）。
 */
export function matchesKeyword(keyword: string, ...texts: (string | null | undefined)[]): boolean {
  const q = keyword.trim().toLowerCase();
  return q === '' || texts.some((text) => text?.toLowerCase().includes(q));
}

/**
 * 画面の絞り込みから、サーバーに渡す絞り込み（取得のキーにもなる）を作る。入力を開くしるし（add）は
 * 絞り込みではないので除き、空のキーワードは「絞り込まない」と同じキーにする
 */
export function toListFilter<T extends { q: string; add?: unknown }>({
  add: _add,
  q,
  ...filter
}: T): Omit<T, 'add' | 'q'> & { q?: string } {
  const keyword = q.trim();
  return keyword ? { ...filter, q: keyword } : filter;
}
