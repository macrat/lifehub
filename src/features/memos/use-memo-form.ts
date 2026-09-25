import { useState } from 'react';
import type { MemoInput } from '../../../shared/validation/memos.ts';
import { memoSchema } from '../../../shared/validation/memos.ts';
import { useFormSubmit } from '../../lib/form.ts';

/**
 * メモのフォームの共通処理。追加（`MemoForm`）と詳細からの編集（`MemoDetailSheet`）で
 * 同じ検証を使う。本文は打つたびに残りの文字数を出すので、FormData から読むのではなく状態として持つ。
 */
export function useMemoForm({
  initialBody = '',
  onSubmit,
  onSaved,
}: {
  initialBody?: string;
  onSubmit: (input: MemoInput) => Promise<unknown>;
  onSaved: () => void;
}) {
  const [body, setBody] = useState(initialBody);
  const form = useFormSubmit({ schema: memoSchema, values: () => ({ body }), onSubmit, onSaved });
  return { ...form, body, setBody };
}
