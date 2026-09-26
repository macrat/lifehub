import type { z } from 'zod';
import { expenseFilterSchema } from '../../../shared/validation/expenses.ts';
import { addSearchSchema } from '../../lib/add-search.ts';
import {
  type FilterConditions,
  type Filters,
  type FiltersPatch,
  filterSearchSchema,
} from '../../lib/search.ts';

/**
 * 立替の検索パラメータ。キーワード（q）に加えて、金額・日付の範囲と To・Fromで絞り込む（`filterSearchSchema`）。
 * 立替の入力を開いて始めるしるし（`add`）も持つ。
 */
export const expenseSearchSchema = filterSearchSchema(
  addSearchSchema('/expenses'),
  expenseFilterSchema,
);
export type ExpenseSearch = z.infer<typeof expenseSearchSchema>;

/** 画面の絞り込み（`useFilterSearch`） */
export type ExpenseFilters = Filters<ExpenseSearch>;
export type ExpenseFiltersPatch = FiltersPatch<ExpenseSearch>;

/** 絞り込みボタンのバッジに数える条件。範囲は上下で 1 つ */
export const EXPENSE_FILTER_CONDITIONS: FilterConditions<ExpenseSearch> = [
  ['min', 'max'],
  ['since', 'until'],
  ['to'],
  ['from'],
];
