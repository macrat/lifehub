import { type FormEvent, useState } from 'react';
import type { z } from 'zod';

export type FormErrors = Record<string, string>;

export type ParseResult<T> = { data: T; errors: null } | { data: null; errors: FormErrors };

/** Select の「なし／共有」を表す値。空文字だとラベルが選択済みに見えないため */
export const SELECT_NONE = 'none';

/** FormData の文字列項目。未入力（空文字）は null */
export function formText(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === 'string' && value !== '' ? value : null;
}

/** 同じ name のチェックボックス群の値（チェックされたものだけ） */
export function formList(formData: FormData, key: string): string[] {
  return formData.getAll(key).filter((v): v is string => typeof v === 'string');
}

/** Select の値。SELECT_NONE は null にする */
export function formSelect(formData: FormData, key: string): string | null {
  const value = formText(formData, key);
  return value === SELECT_NONE ? null : value;
}

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
  /** 検証を通った値の保存。保存は投機的に画面へ反映されるので、送信の完了は待たない */
  onSubmit: (data: z.output<S>) => void;
  /** 送信したとき（ダイアログを閉じる）。送信の失敗は通知（notice）で伝わる */
  onSent?: () => void;
};

/**
 * フォーム送信の共通の流れ: FormData → 検証 → 送信 → 閉じる。
 * フォームライブラリを入れない代わりの最小限の共通処理で、各フォームはフィールドの描画に専念する。
 */
export function useFormSubmit<S extends z.ZodType>({
  schema,
  values,
  onSubmit,
  onSent,
}: UseFormSubmitOptions<S>) {
  const [errors, setErrors] = useState<FormErrors>({});

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseValues(schema, values(new FormData(event.currentTarget)));
    if (parsed.errors) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    onSubmit(parsed.data);
    onSent?.();
  };

  return { errors, handleSubmit };
}
