import { useNavigate } from '@tanstack/react-router';
import type { z } from 'zod';
import { expenseFilterSchema } from '../../../shared/validation/expenses.ts';
import { keywordSearchSchema, useKeywordSearch } from '../../lib/search.ts';
import { addSearchSchema } from '../add/shortcut.ts';

/** 選択欄の「すべて」。絞り込まない状態は URL に残さないので、値としては持たず undefined にする */
export const ALL = 'all';

/**
 * 立替の検索パラメータ。キーワード（q）に加えて、金額・日付の範囲と To・From で絞り込む。
 * 絞り込みは URL に持つので、再読み込みや共有で同じ絞り込みに戻る。
 * 絞り込みの規則は API と同じもの（`expenseFilterSchema`）で、そのままサーバーに渡して絞り込ませる。
 */
export const expenseSearchSchema = keywordSearchSchema.extend({
  /** 立替の入力を開いて始めるしるし（`src/features/add/shortcut.ts`）。絞り込みではない */
  add: addSearchSchema('expense'),
  ...expenseFilterSchema.omit({ q: true }).shape,
});
export type ExpenseSearch = z.infer<typeof expenseSearchSchema>;

/** 履歴に掛ける絞り込み。キーワードだけは URL ではなく検索窓の手元の値を使う（useKeywordSearch） */
export type ExpenseFilters = Omit<ExpenseSearch, 'q'> & { q: string };

/** 更新する項目だけ。undefined はその項目の絞り込みをやめる。キーワードは検索窓が持つのでここには無い */
export type ExpenseFiltersPatch = {
  [K in Exclude<keyof ExpenseFilters, 'q'>]?: ExpenseFilters[K] | undefined;
};

/**
 * 立替画面の検索の状態。URL の検索パラメータが絞り込みそのもので、画面はここから受け取った値を描く。
 * キーワードだけは打つたびに反映するので手元に持つ（URL は置き換えるだけ。src/lib/search.ts）。
 */
export function useExpenseSearch(search: ExpenseSearch) {
  const navigate = useNavigate({ from: '/expenses' });
  const [keyword, setKeyword] = useKeywordSearch(search.q ?? '');

  return {
    filters: { ...search, q: keyword },
    activeFilters: countActiveFilters(search),
    setKeyword,
    /**
     * 絞り込みの変更。履歴には積まず置き換える（1 項目ごとに戻る先が増えると、戻る操作が入力の巻き戻しになる）。
     * resetScroll: false = 一覧のスクロール位置に触らない（絞り込んだ直後に先頭へ飛ばさない）。
     */
    setFilters: (next: ExpenseFiltersPatch) =>
      navigate({ search: (prev) => ({ ...prev, ...next }), replace: true, resetScroll: false }),
  };
}

/** 効いている絞り込みの数。範囲は上下で 1 つと数える（バッジの数字が入力欄の数ではなく条件の数になる） */
export function countActiveFilters(search: ExpenseSearch): number {
  return [
    search.min !== undefined || search.max !== undefined,
    search.since !== undefined || search.until !== undefined,
    search.to !== undefined,
    search.from !== undefined,
  ].filter(Boolean).length;
}
