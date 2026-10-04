import { useState } from 'react';
import {
  type CareType,
  careLogSchema,
  normalizeCareTypes,
} from '../../../shared/validation/lemon.ts';
import { fromDateTimeLocalValue } from '../../lib/date.ts';
import { formText, useFormSubmit } from '../../lib/form.ts';
import type { CareLog, CareLogBody } from './queries.ts';

/** 追加ボタンから始めたときに最初からチェックを入れておく項目。いちばん高頻度にやるのが葉水 */
export const DEFAULT_CARE_TYPES: CareType[] = ['mist'];

/**
 * 世話の記録フォームの共通処理。追加（`CareLogForm`）と詳細からの編集（`CareLogDetailSheet`）で
 * 同じ組み立てと検証を使う。項目はメモが必須かどうかとシートの見出しを変えるので、
 * FormData から読むのではなくここで状態として持ち、チェックした瞬間に表示へ反映する。
 */
export function useCareLogForm({
  initial,
  onSubmit,
  onSaved,
}: {
  /** 最初に入れておく値。編集なら今の記録、追加なら最初にチェックを入れておく項目だけ（日時は今、メモは空） */
  initial: Pick<CareLog, 'careTypes'> & Partial<Pick<CareLog, 'doneAt' | 'note'>>;
  onSubmit: (input: CareLogBody) => Promise<unknown>;
  onSaved: () => void;
}) {
  const [careTypes, setCareTypes] = useState(initial.careTypes);
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
    /** `CareLogFields` に渡す入力欄の状態 */
    fields: {
      careTypes,
      /** 保存を待たずに正規化する（詳細シートの見出しはこの並びをそのまま出すため） */
      onToggleCareType: (careType: CareType, checked: boolean) =>
        setCareTypes((prev) =>
          normalizeCareTypes(checked ? [...prev, careType] : prev.filter((t) => t !== careType)),
        ),
      doneAt: initial.doneAt,
      note: initial.note,
      errors: form.errors,
    },
  };
}

/** `CareLogFields` に渡す入力欄の状態 */
export type CareLogFieldsState = ReturnType<typeof useCareLogForm>['fields'];
