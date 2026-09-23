import type { z } from 'zod';
import { expenseFilterSchema } from '../../../shared/validation/expenses.ts';
import { addSearchSchema } from '../../lib/add-search.ts';
import { type Filters, type FiltersPatch, keywordSearchSchema } from '../../lib/search.ts';

/**
 * 立替の検索パラメータ。キーワード（q）に加えて、金額・日付の範囲と To・From で絞り込む。
 * 絞り込みは URL に持つので、再読み込みや共有で同じ絞り込みに戻る。
 * 絞り込みの規則は API と同じもの（`expenseFilterSchema`）で、そのままサーバーに渡して絞り込ませる。
 */
export const expenseSearchSchema = keywordSearchSchema.extend({
  /** 立替の入力を開いて始めるしるし（`src/lib/add-search.ts`）。絞り込みではない */
  add: addSearchSchema('/expenses'),
  ...expenseFilterSchema.omit({ q: true }).shape,
});
export type ExpenseSearch = z.infer<typeof expenseSearchSchema>;

/** 画面の絞り込み（`useFilterSearch`） */
export type ExpenseFilters = Filters<ExpenseSearch>;
export type ExpenseFiltersPatch = FiltersPatch<ExpenseSearch>;

/** 効いている絞り込みの数。範囲は上下で 1 つと数える（バッジの数字が入力欄の数ではなく条件の数になる） */
export function countActiveFilters(search: ExpenseSearch): number {
  return [
    search.min !== undefined || search.max !== undefined,
    search.since !== undefined || search.until !== undefined,
    search.to !== undefined,
    search.from !== undefined,
  ].filter(Boolean).length;
}
