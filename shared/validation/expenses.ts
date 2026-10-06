import { z } from 'zod';
import { SCHEDULE_FREQUENCIES } from '../expenses.ts';
import { clientIdShape, cursorShape, dateStringSchema, uuidSchema } from './common.ts';

/** 立替の項目（組み合わせの規則を掛ける前）。MCP が一部の項目を省略できる形に変えるのに使う */
export const expenseFieldsSchema = z.object({
  /** From: 払った人（債権者）。null は共有（共有口座から払った）。精算なら払った人 */
  fromUserId: uuidSchema.nullable(),
  /** To: 誰のために払ったか（債務者）。null は共有（共有口座のために払った）。精算なら受け取った人 */
  toUserId: uuidSchema.nullable(),
  /** 円。正の整数 */
  amount: z.int().positive('金額は 1 円以上にしてください').max(100_000_000),
  description: z.string().trim().min(1, '内容を入力してください').max(200),
  /** JST の暦日 */
  spentOn: dateStringSchema,
});

/**
 * 立替の組み合わせの規則。追加・編集と MCP の入力が同じ規則を通るよう、スキーマの形とは切り離す。
 * 自分から自分へは貸し借りが生じないので、From と To は違う当事者にする（共有から共有へも同じく選べない）
 */
function withExpenseRules<
  T extends z.ZodType<{ fromUserId: string | null; toUserId: string | null }>,
>(schema: T): T {
  return schema.refine((v) => v.fromUserId !== v.toUserId, {
    message: 'From と To に同じ相手は選べません',
    path: ['toUserId'],
  });
}

/** 立替の入力。追加と編集で同じ（編集は全項目を置き換える） */
export const expenseSchema = withExpenseRules(expenseFieldsSchema);
export type ExpenseInput = z.infer<typeof expenseSchema>;

/** 検証済みの値（MCP が組み立てた入力や、今の値に部分更新を重ねたもの）に組み合わせの規則だけを掛ける */
export const expenseRulesSchema = withExpenseRules(z.custom<ExpenseInput>());

/** API（`expenses.create`）が受け取る追加の入力（`clientIdShape`） */
export const createExpenseRequestSchema = expenseSchema.safeExtend(clientIdShape);

/**
 * 立替スケジュールの入力（追加と変更で同じ。変更は全項目を置き換える）。項目は立替と同じで、日付の代わりに最初の日
 * （startsOn）と繰り返し（frequency）を持つ。組み合わせの規則も立替と同じ
 */
export const expenseScheduleSchema = withExpenseRules(
  expenseFieldsSchema.omit({ spentOn: true }).extend({
    startsOn: dateStringSchema,
    frequency: z.enum(SCHEDULE_FREQUENCIES, '繰り返しを選んでください'),
  }),
);
export type ExpenseScheduleInput = z.infer<typeof expenseScheduleSchema>;

/** API（`expenses.createSchedule`）が受け取る追加の入力（`clientIdShape`） */
export const createExpenseScheduleRequestSchema = expenseScheduleSchema.safeExtend(clientIdShape);

/** To・From の「共有」。ユーザー ID と混ざらないよう、URL や API の値としても語で置く */
export const SHARED = 'shared';

/**
 * 履歴の絞り込み。範囲は両端を含み、省略した端は制限しない（最小だけ・終了日だけでも絞り込める）。
 * お金の画面の URL（`expenseSearchSchema`）と API（`expenseListQuerySchema`）が同じ規則を使う。
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
  /** From（払った人）: SHARED（共有）かユーザー ID */
  from: z.union([z.literal(SHARED), uuidSchema]).optional(),
});
export type ExpenseFilter = z.infer<typeof expenseFilterSchema>;

/** お金の画面の一覧の 1 ページの取得（`expenses.list`。`cursorShape`） */
export const expenseListQuerySchema = expenseFilterSchema.extend(cursorShape);
export type ExpenseListQuery = z.infer<typeof expenseListQuerySchema>;
