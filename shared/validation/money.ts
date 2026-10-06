import { z } from 'zod';
import { cursorShape, dateStringSchema } from './common.ts';

/**
 * 入出金の履歴の絞り込み。範囲は両端を含み、省略した端は制限しない。
 * お金の画面の「入出金」の URL（`transactionSearchSchema`）と API（`transactionListQuerySchema`）が同じ規則を使う。
 */
export const transactionFilterSchema = z.object({
  /** 内容・分類のキーワード（大文字小文字を区別しない部分一致） */
  q: z.string().optional(),
  /** 日付の最初・最後 */
  since: dateStringSchema.optional(),
  until: dateStringSchema.optional(),
  /** 金融機関の名前 */
  account: z.string().optional(),
});
export type TransactionFilter = z.infer<typeof transactionFilterSchema>;

/** 履歴の 1 ページの取得（`money.transactions`。`cursorShape`） */
export const transactionListQuerySchema = transactionFilterSchema.extend(cursorShape);
export type TransactionListQuery = z.infer<typeof transactionListQuerySchema>;
