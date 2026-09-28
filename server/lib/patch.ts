import type { z } from 'zod';
import { ValidationError } from './errors.ts';

/**
 * 部分更新（MCP）の共通の手順: 今の値に、指定された項目（undefined でない項目）だけを重ね、
 * 追加・編集と同じ組み合わせの規則を掛ける。規則に合わなければ、理由を ValidationError の文で返す。
 * WHY NOT 全項目の置き換え: 「タイトルだけ変えて」を頼まれた LLM は他の項目を書き写さないので、
 * 置き換えにすると省いた項目が消える。
 * rules は検証済みの値（出力の形）に規則だけを掛けるスキーマ（`withXxxRules(z.custom<T>())`）。
 */
export function applyPatch<T extends object>(
  current: T,
  patch: { [K in keyof T]?: T[K] | undefined },
  rules: z.ZodType<T>,
): T {
  const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  return checkRules({ ...current, ...defined } as T, rules);
}

/**
 * 組み合わせの規則を掛ける。規則に合わなければ、理由を ValidationError の文で返す。
 * API のスキーマを通らずに組み立てた入力（MCP が LLM の入力から作ったもの）に使う。
 */
export function checkRules<T>(value: T, rules: z.ZodType<T>): T {
  const result = rules.safeParse(value);
  if (!result.success) {
    throw new ValidationError(result.error.issues.map((issue) => issue.message).join(' / '));
  }
  return value;
}
