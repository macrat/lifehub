import { z } from 'zod';
import { moneyFilterSchema } from '../../../shared/validation/money.ts';
import { addSearchSchema } from '../../lib/add-search.ts';
import { type FilterConditions, filterSearchSchema, searchArray } from '../../lib/search.ts';

/**
 * お金の画面の検索パラメータ。キーワード（q）に加えて、金額・日付の範囲と To・From で絞り込む（`filterSearchSchema`）。
 * 立替の入力を開いて始めるしるし（`add`）も持つ。
 */
export const moneySearchSchema = filterSearchSchema(addSearchSchema('/money'), moneyFilterSchema);
export type MoneySearch = z.infer<typeof moneySearchSchema>;

/** 絞り込みボタンのバッジに数える条件。範囲は上下で 1 つ */
export const MONEY_FILTER_CONDITIONS: FilterConditions<MoneySearch> = [
  ['min', 'max'],
  ['since', 'until'],
  ['to'],
  ['from'],
];

/**
 * 残高の推移の画面の検索パラメータ。出す口座の名前（`MoneyAccount` の name）の並び。
 * お金の画面の口座のタイルから開くと、押したタイルの口座だけが入る。読めない値は「どれも選んでいない」にする。
 */
export const balanceSearchSchema = z.object({
  accounts: searchArray(z.string()).catch([]),
});
