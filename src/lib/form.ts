import { type FormEvent, useState } from 'react';
import type { z } from 'zod';

export type FormErrors = Record<string, string>;

export type ParseResult<T> = { data: T; errors: null } | { data: null; errors: FormErrors };

/** `<form>` の FormData を素の値にする。空文字は未入力として undefined にする（optional なフィールドをそのまま扱えるようにするため） */
export function formValues(formData: FormData): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    raw[key] = value === '' ? undefined : value;
  }
  return raw;
}

/** 組み立て済みの値を Zod スキーマで検証し、フィールドごとのエラーにまとめる */
function parseValues<S extends z.ZodType>(schema: S, values: unknown): ParseResult<z.output<S>> {
  const result = schema.safeParse(values);
  if (result.success) return { data: result.data, errors: null };
  const errors: FormErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.map(String).join('.') || '_';
    errors[key] ??= issue.message;
  }
  return { data: null, errors };
}

type UseFormSubmitOptions<S extends z.ZodType> = {
  schema: S;
  /** FormData（と必要ならコンポーネントの状態）から検証前の値を組み立てる */
  values: (formData: FormData) => unknown;
  onSubmit: (data: z.output<S>) => Promise<unknown>;
  /** 送信が成功したとき（ダイアログを閉じるなど） */
  onSuccess?: () => void;
  errorMessage?: string;
};

/**
 * フォーム送信の共通の流れ: FormData → 検証 → 送信 → 成功なら onSuccess、失敗ならメッセージ。
 * フォームライブラリを入れない代わりの最小限の共通処理で、各フォームはフィールドの描画に専念する。
 */
export function useFormSubmit<S extends z.ZodType>({
  schema,
  values,
  onSubmit,
  onSuccess,
  errorMessage = '保存に失敗しました',
}: UseFormSubmitOptions<S>) {
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseValues(schema, values(new FormData(event.currentTarget)));
    if (parsed.errors) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setSubmitError(null);
    setSubmitting(true);
    try {
      await onSubmit(parsed.data);
      onSuccess?.();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  return { errors, submitError, submitting, handleSubmit };
}
