import { z } from 'zod';
import { HUE_MAX } from '../color.ts';
import { DAY_MINUTES, PASSWORD_MIN_LENGTH } from '../constants.ts';
import { nameSchema } from './common.ts';

const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `パスワードは${PASSWORD_MIN_LENGTH}文字以上にしてください`)
  .max(128);

/**
 * 操作する人（ログイン中のユーザー）の今のパスワード。パスワードの変更とユーザーの登録で、本人であることを
 * 確かめ直すのに使う（users service）。奪ったセッションだけでは持ち主を締め出したり、別の入口を作ったりできないようにする
 */
const currentPasswordSchema = z.string().min(1, '今のパスワードを入力してください').max(128);

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

/**
 * 画面の API（`users.create`）からの登録。登録する人の今のパスワードも受け取る。
 * scripts/create-user.ts は DB に直接つなぐ（ログインしている人がいない）ので `createUserSchema` を使う
 */
export const registerUserSchema = createUserSchema.extend({
  currentPassword: currentPasswordSchema,
});
export type RegisterUserInput = z.infer<typeof registerUserSchema>;

export const updateUserSchema = z
  .object({
    name: nameSchema.optional(),
    password: passwordSchema.optional(),
    hue: hueSchema.optional(),
    allDayNotifyMinutes: allDayNotifyMinutesSchema.optional(),
    /** パスワードを変えるときだけ要る */
    currentPassword: currentPasswordSchema.optional(),
  })
  .refine(
    ({ currentPassword: _, ...changes }) =>
      Object.values(changes).some((value) => value !== undefined),
    { message: '変更する項目がありません' },
  )
  .refine((v) => v.password === undefined || v.currentPassword !== undefined, {
    message: '今のパスワードを入力してください',
    path: ['currentPassword'],
  });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const loginSchema = z.object({
  /**
   * 小文字にそろえる。better-auth もメールを小文字にして保存・照合するので、重複の確認（users service）を
   * 同じ形で行うため（大文字だけ違うメールも同じ人と見る）
   */
  email: z.email('メールアドレスの形式が正しくありません').toLowerCase(),
  password: z.string().min(1, 'パスワードを入力してください'),
});
export type LoginInput = z.infer<typeof loginSchema>;
