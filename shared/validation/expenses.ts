import { z } from 'zod';
import { newId } from '../id.ts';
import { dateStringSchema, uuidSchema } from './common.ts';

/** 立替の入力。追加と編集で同じ（編集は全項目を置き換える） */
export const expenseSchema = z
  .object({
    /** From: 払った人 */
    fromUserId: uuidSchema,
    /** To: 誰のために払ったか。null は共有（折半）。精算なら受け取った人 */
    toUserId: uuidSchema.nullable(),
    /** 円。正の整数 */
    amount: z.int().positive('金額は 1 円以上にしてください').max(100_000_000),
    description: z.string().trim().min(1, '内容を入力してください').max(200),
    /** JST の暦日 */
    spentOn: dateStringSchema,
  })
  .refine((v) => v.fromUserId !== v.toUserId, {
    message: 'From と To に同じ人は選べません',
    path: ['toUserId'],
  });
export type ExpenseInput = z.infer<typeof expenseSchema>;

/** API（POST /api/expenses）が受け取る追加の入力。ID の決め方は createEventRequestSchema と同じ。 */
export const createExpenseRequestSchema = expenseSchema.safeExtend({
  id: uuidSchema.default(newId),
});
