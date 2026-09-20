import type { z } from 'zod';

export type FormErrors = Record<string, string>;

export type ParseFormResult<T> = { data: T; errors: null } | { data: null; errors: FormErrors };

/**
 * `<form>` の FormData を Zod スキーマで検証する。フォームライブラリを入れない代わりの最小限の共通処理。
 * 空文字は未入力として undefined に変換する（optional なフィールドをそのまま扱えるようにするため）。
 */
export function parseForm<S extends z.ZodType>(
  schema: S,
  formData: FormData,
): ParseFormResult<z.output<S>> {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    raw[key] = value === '' ? undefined : value;
  }
  const result = schema.safeParse(raw);
  if (result.success) return { data: result.data, errors: null };
  const errors: FormErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.map(String).join('.') || '_';
    errors[key] ??= issue.message;
  }
  return { data: null, errors };
}
