import { useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { dateStringSchema } from '../../../shared/validation/common.ts';
import { keywordSearchSchema, matchesKeyword, useKeywordSearch } from '../../lib/search.ts';
import type { Expense } from './queries.ts';

/** 選択欄の「すべて」。絞り込まない状態は URL に残さないので、値としては持たず undefined にする */
export const ALL = 'all';
/** To の「共有」。ユーザー ID と混ざらないよう、URL にも語として置く */
export const SHARED = 'shared';

/**
 * 立替の検索パラメータ。キーワード（q）に加えて、金額・日付の範囲と To・From で絞り込む。
 * 絞り込みは URL に持つので、再読み込みや共有で同じ絞り込みに戻る。
 * 範囲は両端を含み、省略した端は制限しない（最小だけ・終了日だけでも絞り込める）。
 */
export const expenseSearchSchema = keywordSearchSchema.extend({
  /**
   * 立替の入力を開いて始めるしるし（PWA のショートカット。`src/lib/add-shortcut.ts`）。
   * 絞り込みではないので、開いたらすぐ消す。
   */
  add: z.literal('expense').optional(),
  /** 金額（円）の下限・上限 */
  min: z.coerce.number().int().nonnegative().optional(),
  max: z.coerce.number().int().nonnegative().optional(),
  /** 使った日の最初・最後 */
  since: dateStringSchema.optional(),
  until: dateStringSchema.optional(),
  /** To（誰のために払ったか）: SHARED（共有）かユーザー ID */
  to: z.string().optional(),
  /** From（払った人）: ユーザー ID（From に共有は無い） */
  from: z.string().optional(),
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

/** 絞り込みに合う立替か。範囲は両端を含み、日付は文字列のまま比べられる（YYYY-MM-DD） */
export function matchesExpense(expense: Expense, f: ExpenseFilters): boolean {
  if (f.min !== undefined && expense.amount < f.min) return false;
  if (f.max !== undefined && expense.amount > f.max) return false;
  if (f.since !== undefined && expense.spentOn < f.since) return false;
  if (f.until !== undefined && expense.spentOn > f.until) return false;
  if (f.to !== undefined && (expense.toUserId ?? SHARED) !== f.to) return false;
  if (f.from !== undefined && expense.fromUserId !== f.from) return false;
  return matchesKeyword(f.q, expense.description);
}
