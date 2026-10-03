import { z } from 'zod';
import { HUE_MAX } from '../color.ts';
import { DAY_MINUTES, PASSWORD_MIN_LENGTH } from '../constants.ts';
import { nameSchema } from './common.ts';

const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `パスワードは${PASSWORD_MIN_LENGTH}文字以上にしてください`)
  .max(128);

/** ユーザーの色。OKLCH の色相だけを選ぶ（shared/color.ts） */
const hueSchema = z.number().int().min(0).max(HUE_MAX);

/** 終日の予定・タスクを通知する時刻（その日の 0:00 からの分） */
const allDayNotifyMinutesSchema = z
  .number()
  .int()
  .min(0)
  .max(DAY_MINUTES - 1);

export const createUserSchema = z.object({
  email: z.email('メールアドレスの形式が正しくありません'),
  name: nameSchema,
  password: passwordSchema,
  /** 省略時は既存ユーザーと離れた色相を割り当てる */
  hue: hueSchema.optional(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    name: nameSchema.optional(),
    password: passwordSchema.optional(),
    hue: hueSchema.optional(),
    allDayNotifyMinutes: allDayNotifyMinutesSchema.optional(),
  })
  .refine((v) => Object.values(v).some((value) => value !== undefined), {
    message: '変更する項目がありません',
  });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const loginSchema = z.object({
  email: z.email('メールアドレスの形式が正しくありません'),
  password: z.string().min(1, 'パスワードを入力してください'),
});
export type LoginInput = z.infer<typeof loginSchema>;
