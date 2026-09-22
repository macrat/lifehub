import { useState } from 'react';
import {
  type CareType,
  careLogSchema,
  normalizeCareTypes,
} from '../../../shared/validation/lemon.ts';
import { fromDateTimeLocalValue } from '../../lib/date.ts';
import { formText, useFormSubmit } from '../../lib/form.ts';
import type { CareLogBody } from './queries.ts';

/**
 * 世話の記録フォームの共通処理。追加（`CareLogForm`）と詳細からの編集（`CareLogDetailSheet`）で
 * 同じ組み立てと検証を使う。項目はメモが必須かどうかとシートの見出しを変えるので、
 * FormData から読むのではなくここで状態として持ち、チェックした瞬間に表示へ反映する。
 */
export function useCareLogForm({
  initialCareTypes,
  onSubmit,
  onSaved,
}: {
  initialCareTypes: CareType[];
  onSubmit: (input: CareLogBody) => Promise<unknown>;
  onSaved: () => void;
}) {
  const [careTypes, setCareTypes] = useState(initialCareTypes);
  const form = useFormSubmit({
    schema: careLogSchema,
    values: (fd) => {
      const doneAt = formText(fd, 'doneAt');
      return {
        careTypes,
        doneAt: doneAt === null ? undefined : fromDateTimeLocalValue(doneAt),
        note: formText(fd, 'note'),
      };
    },
    onSubmit: (data) => onSubmit({ ...data, doneAt: data.doneAt.toISOString() }),
    onSaved,
  });
  return {
    ...form,
    careTypes,
    /** 保存を待たずに正規化する（詳細シートの見出しはこの並びをそのまま出すため） */
    toggleCareType: (careType: CareType, checked: boolean) =>
      setCareTypes((prev) =>
        normalizeCareTypes(checked ? [...prev, careType] : prev.filter((t) => t !== careType)),
      ),
  };
}
