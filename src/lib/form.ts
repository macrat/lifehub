import { type FormEvent, useState } from 'react';
import type { z } from 'zod';
import { closeNotice } from './ui/notice.ts';

export type FormErrors = Record<string, string>;

type ParseResult<T> = { data: T; errors: null } | { data: null; errors: FormErrors };

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
export function selectValue(value: string): string | null {
  return value === SELECT_NONE ? null : value;
}

/** FormData の Select の値。SELECT_NONE は null にする */
export function formSelect(formData: FormData, key: string): string | null {
  const value = formText(formData, key);
  return value === null ? null : selectValue(value);
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
  /** 検証を通った値の保存。結果は待つが、画面には楽観的更新で先に反映されている */
  onSubmit: (data: z.output<S>) => Promise<unknown>;
  /** 保存できたとき（ダイアログのマウントをやめる） */
  onSaved?: () => void;
};

/** フォームを入れた `RecordSheet` にそのまま渡す props（送信中は閉じた見た目・保存の失敗・送信） */
export type FormSheetProps = {
  open: boolean;
  error: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

/**
 * フォーム送信の共通の流れ: FormData → 検証 → 送信 → 保存できたら知らせる。
 * 送信すると同時に submitted を立ててダイアログを閉じた見た目にし（入力はそのまま残す）、
 * 保存できたら onSaved、失敗したら submitted を戻して開き直し、理由をフォームの中に出す。
 * 楽観的に保存する書き込みは送り始めた時点で保存できたことになるので（`useOptimisticMutation`）、
 * onSaved はすぐに呼ばれ、開き直すのはサーバーの返事を待つ書き込み（ログイン、ユーザー、配信 URL、API キーの発行）だけ。
 * フォームライブラリを入れない代わりの最小限の共通処理で、各フォームはフィールドの描画に専念する。
 * シートに入れるフォームは `sheet` をそのまま `RecordSheet` に広げる（開閉・失敗・送信の結び方を 1 か所に置く）。
 */
export function useFormSubmit<S extends z.ZodType>({
  schema,
  values,
  onSubmit,
  onSaved,
}: UseFormSubmitOptions<S>) {
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseValues(schema, values(new FormData(event.currentTarget)));
    if (parsed.errors) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setSubmitError(null);
    setSubmitted(true);
    try {
      await onSubmit(parsed.data);
      onSaved?.();
    } catch (error) {
      // 開き直してこの中に理由を出すので、共通の通知は消す（失敗を伝える場所は 1 つにする）
      closeNotice();
      setSubmitted(false);
      setSubmitError(error instanceof Error ? error.message : '保存に失敗しました');
    }
  };

  const sheet: FormSheetProps = { open: !submitted, error: submitError, onSubmit: handleSubmit };
  return { errors, submitError, submitted, handleSubmit, sheet };
}
