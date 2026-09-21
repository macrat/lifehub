import { useState } from 'react';
import { createEventSchema, type RecurrenceScope } from '../../../shared/validation/events.ts';
import { useFormSubmit } from '../../lib/form.ts';
import { eventInputFromForm, type ItemFormValues, taskInputFromForm } from './form-values.ts';
import type { CreateEventBody } from './queries.ts';

/**
 * 予定・タスクのフォームの共通処理。追加（`EventForm` / `TaskForm`）と詳細からの編集
 * （`ItemDetailSheet`）で同じ組み立てと検証を使う。
 * 終日かどうかは日時の入力欄そのものを入れ替えるので、入力欄ではなくここで状態として持つ。
 */
export function useItemForm({
  kind,
  initial,
  scope = 'all',
  onSubmit,
  onSaved,
}: {
  kind: 'event' | 'task';
  initial: ItemFormValues;
  /** this のときは繰り返しの設定は変更できない（回の行は繰り返さない） */
  scope?: RecurrenceScope;
  onSubmit: (input: CreateEventBody) => Promise<unknown>;
  onSaved: () => void;
}) {
  const [allDay, setAllDay] = useState(initial.allDay);
  // 編集の対象が入れ替わったら（繰り返しの「すべて」で繰り返し元を読み直したとき）その値に合わせ直す
  const [shown, setShown] = useState(initial);
  if (shown !== initial) {
    setShown(initial);
    setAllDay(initial.allDay);
  }
  const thisOnly = scope === 'this';

  const form = useFormSubmit({
    schema: createEventSchema,
    values: (fd) =>
      kind === 'task'
        ? taskInputFromForm(fd, { initial, thisOnly })
        : eventInputFromForm(fd, { initial, allDay, thisOnly }),
    onSubmit: (data) =>
      onSubmit({
        ...data,
        startsAt: data.startsAt?.toISOString() ?? null,
        endsAt: data.endsAt?.toISOString() ?? null,
      }),
    onSaved,
  });

  return { ...form, allDay, setAllDay, thisOnly };
}
