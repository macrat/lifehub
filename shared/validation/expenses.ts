import { z } from 'zod';
import { dateStringSchema, uuidSchema } from './common.ts';

export const createExpenseSchema = z.object({
  /** 立て替えた人 */
  paidBy: uuidSchema,
  /** 円。正の整数 */
  amount: z.int().positive('金額は 1 円以上にしてください').max(100_000_000),
  description: z.string().trim().min(1, '内容を入力してください').max(200),
  /** JST の暦日 */
  spentOn: dateStringSchema,
});
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
