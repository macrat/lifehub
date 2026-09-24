import { useNavigate } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { z } from 'zod';
import { isDateString } from '../../shared/date.ts';
import type { DateString } from '../../shared/types.ts';

/** キーワード検索をする画面の検索パラメータ。空文字は付けない（検索していない状態は URL にも残さない） */
export const keywordSearchSchema = z.object({ q: z.string().optional() });
type KeywordSearch = z.infer<typeof keywordSearchSchema>;

/**
 * 検索キーワードの状態。初期値は URL の q（再読み込みや共有で絞り込みが戻る）。
 *
 * 打つたびの反映は router の navigate ではなく history.replaceState で URL を差し替えるだけにする。
 * 表示する値は手元の状態なので、入力してから画面に出るまでが同じ描画で完結する。
 * navigate だと入力 → URL → 再描画と非同期に往復し、その間の書き戻しで IME の変換が切れる。
 * 履歴には積まない（1 文字ごとに戻る先が増えると、戻る操作が打ち直しの巻き戻しになる）。
 * router を通さずに書いても、後の移動（絞り込みや表示の切り替え。`usePatchSearch`）で q は消えない。
 * router は移動のたびに今の URL を読み直してから次の URL を組み立てるため（e2e/search.spec.ts が確かめる）。
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

/** 選択欄の「すべて」。絞り込まない状態は URL に残さないので、値としては持たず undefined にする */
export const ALL = 'all';

/** 選択欄の値を絞り込みにする。「すべて」（`ALL`）は絞り込みをやめる（URL にも残さない） */
export function optionOrUndefined<T extends string>(value: string): T | undefined {
  return value === ALL ? undefined : (value as T);
}

/** date 入力の値を絞り込みにする。消すと空文字になり、打っている途中は日付にならない。どちらも絞り込みをやめる */
export function dateOrUndefined(value: string): DateString | undefined {
  return isDateString(value) ? value : undefined;
}

/**
 * 今の画面のまま、検索パラメータの一部だけを変える。replace で履歴に積むか置き換えるかを選ぶ
 * （絞り込みの入力やしるしの消去は置き換える。1 項目ごとに戻る先が増えると、戻る操作が入力の巻き戻しになる）。
 * resetScroll: false = 画面のスクロール位置に触らない。既定だと router が移動のたびに位置を復元し、
 * 一覧が絞り込んだ直後に先頭へ飛び、カレンダーはスワイプの面を中央へ戻した直後に元の位置へ引き戻される。
 * 関数は固定する（カレンダーは面に渡す関数をこれから作り、同一性で描き直しを省く）。
 *
 * WHY 型の無い to: '.': どの画面からも呼ぶので、画面ごとの検索パラメータの型をここでは名指せない。
 * 渡す値の型は呼ぶ側（画面の検索パラメータから導いた型）で守る。
 */
export function usePatchSearch() {
  const navigate = useNavigate();
  return useCallback(
    (patch: object, { replace }: { replace: boolean }) =>
      navigate({
        to: '.',
        search: (prev: object) => ({ ...prev, ...patch }),
        replace,
        resetScroll: false,
      }),
    [navigate],
  );
}

/** 画面の絞り込み。キーワードだけは URL ではなく検索窓の手元の値を使う（`useKeywordSearch`） */
export type Filters<S extends KeywordSearch> = Omit<S, 'q'> & { q: string };

/** 更新する項目だけ。undefined はその項目の絞り込みをやめる。キーワードは検索窓が持つのでここには無い */
export type FiltersPatch<S extends KeywordSearch> = {
  [K in Exclude<keyof S, 'q'>]?: S[K] | undefined;
};

/**
 * 絞り込みのある画面（立替・レモン）の検索の状態。URL の検索パラメータが絞り込みそのもので、
 * 画面はここから受け取った値を描く。キーワードだけは打つたびに反映するので手元に持つ（`useKeywordSearch`）。
 * countActive は、キーワード以外で効いている絞り込みの数（絞り込みボタンのバッジ）を数える feature ごとの規則。
 */
export function useFilterSearch<S extends KeywordSearch & { add?: unknown }>(
  search: S,
  countActive: (search: S) => number,
) {
  const patchSearch = usePatchSearch();
  const [keyword, setKeyword] = useKeywordSearch(search.q ?? '');
  const panel = useFilterPanel();
  const filters: Filters<S> = { ...search, q: keyword };
  const activeFilters = countActive(search);
  return {
    filters,
    /** サーバーに渡す絞り込み（取得のキーにもなる。`toListFilter`） */
    listFilter: toListFilter(filters),
    setKeyword,
    /** 絞り込みの変更。履歴には積まず置き換える */
    setFilters: (next: FiltersPatch<S>) => patchSearch(next, { replace: true }),
    /** キーワード以外で効いている絞り込みの数 */
    activeFilters,
    /** 何かで絞り込んでいるか（空の一覧の文言を「一致するものが無い」にする） */
    filtering: keyword !== '' || activeFilters > 0,
    panel,
  };
}

/**
 * 詳細な絞り込みのフォーム（`FilterPanel`）を開いているか。URL には載せない（開き直したら閉じている）。
 * 絞り込みボタン（`FilterButton`）が開け閉めする。
 */
export function useFilterPanel() {
  const [open, setOpen] = useState(false);
  return { open, toggle: () => setOpen((v) => !v) };
}
