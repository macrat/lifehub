import { z } from 'zod';
import { transactionFilterSchema } from '../../../shared/validation/money.ts';
import { type FilterConditions, filterSearchSchema } from '../../lib/search.ts';

/**
 * 入出金の一覧（お金の画面の「入出金」）の検索パラメータ。キーワード（q）・日付の範囲・金融機関で絞り込む。
 * 入出金は画面から書かないので、入力を開いて始めるしるし（`add`）は受けない。
 */
export const transactionSearchSchema = filterSearchSchema(
  z.undefined().optional(),
  transactionFilterSchema,
);
type TransactionSearch = z.infer<typeof transactionSearchSchema>;

/** 絞り込みボタンのバッジに数える条件。範囲は上下で 1 つ */
export const TRANSACTION_FILTER_CONDITIONS: FilterConditions<TransactionSearch> = [
  ['since', 'until'],
  ['account'],
];
