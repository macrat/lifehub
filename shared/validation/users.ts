import { z } from 'zod';
import { HUE_MAX } from '../color.ts';
import { PASSWORD_MIN_LENGTH } from '../constants.ts';

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `パスワードは${PASSWORD_MIN_LENGTH}文字以上にしてください`)
  .max(128);

/** ユーザーの色。OKLCH の色相だけを選ぶ（shared/color.ts） */
export const hueSchema = z.coerce.number().int().min(0).max(HUE_MAX);

export const createUserSchema = z.object({
  email: z.email('メールアドレスの形式が正しくありません'),
  name: z.string().trim().min(1, '名前を入力してください').max(50),
  password: passwordSchema,
  /** 省略時は既存ユーザーと離れた色相を割り当てる */
  hue: hueSchema.optional(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1, '名前を入力してください').max(50).optional(),
    password: passwordSchema.optional(),
    hue: hueSchema.optional(),
  })
  .refine((v) => v.name !== undefined || v.password !== undefined || v.hue !== undefined, {
    message: '変更する項目がありません',
  });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const loginSchema = z.object({
  email: z.email('メールアドレスの形式が正しくありません'),
  password: z.string().min(1, 'パスワードを入力してください'),
});
export type LoginInput = z.infer<typeof loginSchema>;
