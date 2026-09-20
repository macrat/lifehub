import { z } from 'zod';
import { dateStringSchema, uuidSchema } from './common.ts';

export const createExpenseSchema = z
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
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
