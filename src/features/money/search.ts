import { z } from 'zod';
import { type ExpenseFilter, expenseFilterSchema } from '../../../shared/validation/expenses.ts';
import {
  type TransactionFilter,
  transactionFilterSchema,
} from '../../../shared/validation/money.ts';
import { addSearchSchema } from '../../lib/add-search.ts';
import { type FilterConditions, type Filters, filterSearchSchema } from '../../lib/search.ts';

/**
 * お金の画面の一覧: 立替（`expenses`）か、Money Forward から取り込んだ入出金（`transactions`）。
 * 既定は立替（追加ボタンで足した立替がそのまま見える）。
 */
export type MoneyView = 'expenses' | 'transactions';

/**
 * お金の画面の検索パラメータ。立替の絞り込み（`expenseFilterSchema`）と入出金の金融機関（`account`）、どちらの一覧か
 * （`view`。既定の立替は URL に残さない）、立替の入力を開いて始めるしるし（`add`）。
 * キーワードと日付の範囲は両方の一覧で同じ物を使うので、一覧を切り替えても絞り込みが続く。
 */
export const moneySearchSchema = filterSearchSchema(
  addSearchSchema('/money'),
  expenseFilterSchema.extend({
    account: transactionFilterSchema.shape.account,
    view: z.literal('transactions').optional(),
  }),
);
export type MoneySearch = z.infer<typeof moneySearchSchema>;

/** 絞り込みボタンのバッジに数える条件（一覧ごと）。範囲は上下で 1 つ */
export const MONEY_FILTER_CONDITIONS: Record<MoneyView, FilterConditions<MoneySearch>> = {
  expenses: [['min', 'max'], ['since', 'until'], ['to'], ['from']],
  transactions: [['since', 'until'], ['account']],
};

/** 画面の絞り込み（`useFilterSearch` の listFilter）から、立替の一覧に渡す絞り込み */
export function expenseListFilter({
  q,
  min,
  max,
  since,
  until,
  to,
  from,
}: Omit<Filters<MoneySearch>, 'q'> & { q?: string }): ExpenseFilter {
  return { q, min, max, since, until, to, from };
}

/** 画面の絞り込みから、入出金の一覧に渡す絞り込み */
export function transactionListFilter({
  q,
  since,
  until,
  account,
}: Omit<Filters<MoneySearch>, 'q'> & { q?: string }): TransactionFilter {
  return { q, since, until, account };
}
