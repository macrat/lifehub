import { useState } from 'react';
import { type CareType, careLogSchema } from '../../../shared/validation/lemon.ts';
import { fromDateTimeLocalValue } from '../../lib/date.ts';
import { formText, useFormSubmit } from '../../lib/form.ts';
import type { CareLogBody } from './queries.ts';

/**
 * 世話の記録フォームの共通処理。追加（`CareLogForm`）と詳細からの編集（`CareLogDetailSheet`）で
 * 同じ組み立てと検証を使う。種別はメモが必須かどうかを変えるので、入力欄ではなくここで状態として持つ。
 */
export function useCareLogForm({
  initialCareType,
  onSubmit,
  onSaved,
}: {
  initialCareType: CareType;
  onSubmit: (input: CareLogBody) => Promise<unknown>;
  onSaved: () => void;
}) {
  const [careType, setCareType] = useState(initialCareType);
  const form = useFormSubmit({
    schema: careLogSchema,
    values: (fd) => {
      const doneAt = formText(fd, 'doneAt');
      return {
        careType,
        doneAt: doneAt === null ? undefined : fromDateTimeLocalValue(doneAt),
        note: formText(fd, 'note'),
      };
    },
    onSubmit: (data) => onSubmit({ ...data, doneAt: data.doneAt.toISOString() }),
    onSaved,
  });
  return { ...form, careType, setCareType };
}
