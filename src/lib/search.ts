import { useNavigate } from '@tanstack/react-router';
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
 * 読んだ分が手元にある一覧（カレンダーのリスト表示）が、打つたびに取り直さずに手元で絞り込むのに使う。
 * 全件を手元に持たない履歴（立替・レモン）はサーバーが同じ規則で絞り込む（server/lib/history.ts の `containsKeyword`）。
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

/** 画面の絞り込み。キーワードだけは URL ではなく検索窓の手元の値を使う（`useKeywordSearch`） */
export type Filters<S extends { q?: string | undefined }> = Omit<S, 'q'> & { q: string };

/** 更新する項目だけ。undefined はその項目の絞り込みをやめる。キーワードは検索窓が持つのでここには無い */
export type FiltersPatch<S> = { [K in Exclude<keyof S, 'q'>]?: S[K] | undefined };

/**
 * 絞り込みのある画面（立替・レモン）の検索の状態。URL の検索パラメータが絞り込みそのもので、
 * 画面はここから受け取った値を描く。キーワードだけは打つたびに反映するので手元に持つ（`useKeywordSearch`）。
 * countActive は効いている条件の数え方（絞り込みボタンのバッジ。画面ごとに条件が違う）。
 */
export function useFilterSearch<S extends { q?: string | undefined; add?: unknown }>(
  search: S,
  countActive: (search: S) => number,
) {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useKeywordSearch(search.q ?? '');
  const filters: Filters<S> = { ...search, q: keyword };
  return {
    filters,
    /** サーバーに渡す絞り込み（取得のキーにもなる。`toListFilter`） */
    listFilter: toListFilter(filters),
    activeFilters: countActive(search),
    setKeyword,
    /**
     * 絞り込みの変更。今の画面のまま検索パラメータだけを変える。履歴には積まず置き換える
     * （1 項目ごとに戻る先が増えると、戻る操作が入力の巻き戻しになる）。
     * resetScroll: false = 一覧のスクロール位置に触らない（絞り込んだ直後に先頭へ飛ばさない）。
     */
    setFilters: (next: FiltersPatch<S>) =>
      navigate({
        to: '.',
        search: (prev: object) => ({ ...prev, ...next }),
        replace: true,
        resetScroll: false,
      }),
  };
}
