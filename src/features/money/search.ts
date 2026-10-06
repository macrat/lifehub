import { z } from 'zod';
import { type ExpenseFilter, expenseFilterSchema } from '../../../shared/validation/expenses.ts';
import {
  type TransactionFilter,
  transactionFilterSchema,
} from '../../../shared/validation/money.ts';
import { addSearchSchema } from '../../lib/add-search.ts';
import { type FilterConditions, filterSearchSchema } from '../../lib/search.ts';

/**
 * お金の画面の検索パラメータ。立替の絞り込み（`expenseFilterSchema`）と入出金の金融機関（`account`）、どちらの一覧か
 * （`view`）、立替の入力を開いて始めるしるし（`add`）。
 * 一覧の既定は立替（追加ボタンで足した立替がそのまま見える）で、既定の値は URL に残さない（画面の `stripSearchParams`）。
 * キーワードと日付の範囲は両方の一覧で同じ物を使うので、一覧を切り替えても絞り込みが続く。
 */
export const moneySearchSchema = filterSearchSchema(
  addSearchSchema('/money'),
  expenseFilterSchema.extend({
    account: transactionFilterSchema.shape.account,
    view: z.enum(['expenses', 'transactions']).default('expenses'),
  }),
);
export type MoneySearch = z.infer<typeof moneySearchSchema>;
export type MoneyView = MoneySearch['view'];

/** 絞り込みボタンのバッジに数える条件（一覧ごと）。範囲は上下で 1 つ */
export const MONEY_FILTER_CONDITIONS: Record<MoneyView, FilterConditions<MoneySearch>> = {
  expenses: [['min', 'max'], ['since', 'until'], ['to'], ['from']],
  transactions: [['since', 'until'], ['account']],
};

/**
 * 画面の絞り込み（`useFilterSearch` の listFilter）から、一覧ごとの API に渡す絞り込みを取り出す。
 * 項目は API のスキーマが知っているので、スキーマに通して余分な項目（一覧の切り替えや、もう一方の一覧の条件）を落とす
 */
export function expenseListFilter(filter: object): ExpenseFilter {
  return expenseFilterSchema.parse(filter);
}

export function transactionListFilter(filter: object): TransactionFilter {
  return transactionFilterSchema.parse(filter);
}
