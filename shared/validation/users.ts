import { z } from 'zod';
import { PASSWORD_MIN_LENGTH } from '../constants.ts';

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `パスワードは${PASSWORD_MIN_LENGTH}文字以上にしてください`)
  .max(128);

export const createUserSchema = z.object({
  email: z.email('メールアドレスの形式が正しくありません'),
  name: z.string().trim().min(1, '名前を入力してください').max(50),
  password: passwordSchema,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1, '名前を入力してください').max(50).optional(),
    password: passwordSchema.optional(),
  })
  .refine((v) => v.name !== undefined || v.password !== undefined, {
    message: '変更する項目がありません',
  });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const loginSchema = z.object({
  email: z.email('メールアドレスの形式が正しくありません'),
  password: z.string().min(1, 'パスワードを入力してください'),
});
export type LoginInput = z.infer<typeof loginSchema>;
