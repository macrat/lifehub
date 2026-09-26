import { useState } from 'react';
import { createEventSchema, type RecurrenceScope } from '../../../shared/validation/events.ts';
import { useFormSubmit } from '../../lib/form.ts';
import { eventInputFromForm, type ItemFormValues, taskInputFromForm } from './form-values.ts';
import type { CreateEventBody } from './queries.ts';

/**
 * 予定・タスクのフォームの共通処理。追加（`ItemForm`）、詳細からの編集
 * （`ItemDetailSheet`）、カレンダーのクイック入力（`QuickEventForm` / `QuickTaskForm`）で同じ組み立てと検証を使う。
 * 終日かどうかは呼び出し側が持つ（フォームなら `useAllDay`、予定のクイック入力なら下書きそのもの）。
 * 1 つの事実を 2 か所に持つと、片方だけが変わったときに見出しと保存する日時が食い違うため。
 */
export function useItemForm({
  kind,
  initial,
  allDay,
  scope = 'all',
  onSubmit,
  onSaved,
}: {
  kind: 'event' | 'task';
  initial: ItemFormValues;
  allDay: boolean;
  /** this のときは繰り返しの設定は変更できない（回の行は繰り返さない） */
  scope?: RecurrenceScope;
  onSubmit: (input: CreateEventBody) => Promise<unknown>;
  onSaved: () => void;
}) {
  const thisOnly = scope === 'this';
  /** 今の入力 → 検証前の値。保存のほか、入力を下書きへ映し戻す（クイック入力）のにも使う */
  const inputFromForm = (fd: FormData) =>
    kind === 'task'
      ? taskInputFromForm(fd, { initial, allDay, thisOnly })
      : eventInputFromForm(fd, { initial, allDay, thisOnly });

  const form = useFormSubmit({
    schema: createEventSchema,
    values: inputFromForm,
    onSubmit: (data) =>
      onSubmit({
        ...data,
        startsAt: data.startsAt?.toISOString() ?? null,
        endsAt: data.endsAt?.toISOString() ?? null,
      }),
    onSaved,
  });

  return { ...form, thisOnly, inputFromForm };
}

/**
 * フォームが持つ「終日かどうか」。日時の入力欄そのものを入れ替えるので、入力欄ではなく状態として持つ。
 * 編集の対象が入れ替わったら（resetKey が別の値になったら。繰り返しの「すべて」で繰り返し元を読み直した、
 * クイック入力の枠を動かした）、その既定値（defaultAllDay）に合わせ直す。
 */
export function useAllDay(defaultAllDay: boolean, resetKey: unknown) {
  const [allDay, setAllDay] = useState(defaultAllDay);
  const [shownKey, setShownKey] = useState(resetKey);
  if (shownKey !== resetKey) {
    setShownKey(resetKey);
    setAllDay(defaultAllDay);
  }
  return [allDay, setAllDay] as const;
}
