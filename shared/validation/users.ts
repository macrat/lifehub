import { z } from 'zod';
import { HUE_MAX } from '../color.ts';
import { DAY_MINUTES, PASSWORD_MIN_LENGTH } from '../constants.ts';
import { nameSchema } from './common.ts';

const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `パスワードは${PASSWORD_MIN_LENGTH}文字以上にしてください`)
  .max(128);

/** 本人の確認に添える、操作する人の今のパスワード（`server/lib/trpc.ts` の `reauthedProcedure`） */
export const reauthSchema = z.object({
  currentPassword: z.string().min(1, '今のパスワードを入力してください').max(128),
});

/** ユーザーの色。OKLCH の色相だけを選ぶ（shared/color.ts） */
const hueSchema = z.number().int().min(0).max(HUE_MAX);

/** 終日の予定・タスクを通知する時刻（その日の 0:00 からの分） */
const allDayNotifyMinutesSchema = z
  .number()
  .int()
  .min(0)
  .max(DAY_MINUTES - 1);

export const createUserSchema = z.object({
  /**
   * 小文字にそろえる。better-auth もメールを小文字にして保存・照合するので、重複の確認（users service）を
   * 同じ形で行うため（大文字だけ違うメールも同じ人と見る）
   */
  email: z.email('メールアドレスの形式が正しくありません').toLowerCase(),
  name: nameSchema,
  password: passwordSchema,
  /** 省略時は既存ユーザーと離れた色相を割り当てる */
  hue: hueSchema.optional(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

/** 画面の API（`users.create`）からの登録。scripts/create-user.ts はログインしている人がいないので `createUserSchema` */
export const registerUserSchema = createUserSchema.extend(reauthSchema.shape);

/** 共有プロフィールの変更（他人の分も変えられる）。パスワードは含めない（`changePasswordSchema`） */
export const updateUserSchema = z
  .object({
    name: nameSchema.optional(),
    hue: hueSchema.optional(),
    allDayNotifyMinutes: allDayNotifyMinutesSchema.optional(),
  })
  .refine((v) => Object.values(v).some((value) => value !== undefined), {
    message: '変更する項目がありません',
  });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/** 自分のパスワードの変更（`me.changePassword`） */
export const changePasswordSchema = reauthSchema.extend({ newPassword: passwordSchema });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const loginSchema = z.object({
  /**
   * 小文字にそろえる。better-auth もメールを小文字にして保存・照合するので、重複の確認（users service）を
   * 同じ形で行うため（大文字だけ違うメールも同じ人と見る）
   */
  email: z.email('メールアドレスの形式が正しくありません').toLowerCase(),
  password: z.string().min(1, 'パスワードを入力してください'),
});
export type LoginInput = z.infer<typeof loginSchema>;
