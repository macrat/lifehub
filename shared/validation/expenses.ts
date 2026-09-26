import { z } from 'zod';
import { clientIdShape, cursorShape, dateStringSchema, uuidSchema } from './common.ts';

/** 立替の項目（組み合わせの規則を掛ける前）。MCP が一部の項目を省略できる形に変えるのに使う */
export const expenseFieldsSchema = z.object({
  /** From: 払った人 */
  fromUserId: uuidSchema,
  /** To: 誰のために払ったか。null は共有（折半）。精算なら受け取った人 */
  toUserId: uuidSchema.nullable(),
  /** 円。正の整数 */
  amount: z.int().positive('金額は 1 円以上にしてください').max(100_000_000),
  description: z.string().trim().min(1, '内容を入力してください').max(200),
  /** JST の暦日 */
  spentOn: dateStringSchema,
});

/** 立替の組み合わせの規則。追加・編集と MCP の入力が同じ規則を通るよう、スキーマの形とは切り離す */
export function withExpenseRules<
  T extends z.ZodType<{ fromUserId: string; toUserId: string | null }>,
>(schema: T): T {
  return schema.refine((v) => v.fromUserId !== v.toUserId, {
    message: 'From と To に同じ人は選べません',
    path: ['toUserId'],
  });
}

/** 立替の入力。追加と編集で同じ（編集は全項目を置き換える） */
export const expenseSchema = withExpenseRules(expenseFieldsSchema);
export type ExpenseInput = z.infer<typeof expenseSchema>;

/** API（POST /api/expenses）が受け取る追加の入力（`clientIdShape`） */
export const createExpenseRequestSchema = expenseSchema.safeExtend(clientIdShape);

/** To の「共有」。ユーザー ID と混ざらないよう、URL や API の値としても語で置く */
export const SHARED = 'shared';

/**
 * 履歴の絞り込み。範囲は両端を含み、省略した端は制限しない（最小だけ・終了日だけでも絞り込める）。
 * 立替画面の URL（`expenseSearchSchema`）と API（`expenseListQuerySchema`）が同じ規則を使う。
 */
export const expenseFilterSchema = z.object({
  /** 内容のキーワード（大文字小文字を区別しない部分一致） */
  q: z.string().optional(),
  /** 金額（円）の下限・上限 */
  min: z.coerce.number().int().nonnegative().optional(),
  max: z.coerce.number().int().nonnegative().optional(),
  /** 使った日の最初・最後 */
  since: dateStringSchema.optional(),
  until: dateStringSchema.optional(),
  /** To（誰のために払ったか）: SHARED（共有）かユーザー ID */
  to: z.union([z.literal(SHARED), uuidSchema]).optional(),
  /** From（払った人）: ユーザー ID（From に共有は無い） */
  from: uuidSchema.optional(),
});
export type ExpenseFilter = z.infer<typeof expenseFilterSchema>;

/** 履歴の 1 ページの取得（GET /api/expenses。`cursorShape`） */
export const expenseListQuerySchema = expenseFilterSchema.extend(cursorShape);
export type ExpenseListQuery = z.infer<typeof expenseListQuerySchema>;
