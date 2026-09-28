import { useRef, useState } from 'react';
import {
  createEventSchema,
  type EventKind,
  type RecurrenceScope,
} from '../../../shared/validation/events.ts';
import { useFormSubmit } from '../../lib/form.ts';
import { type ItemFormValues, itemInputFromForm, switchKindValues } from './form-values.ts';
import type { CreateEventBody } from './queries.ts';

/**
 * 予定・タスクのフォームの共通処理。追加（`ItemForm`）、詳細からの編集
 * （`ItemDetailSheet`）、カレンダーのクイック入力（`QuickItemForm`）で同じ組み立てと検証を使う。
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
  kind: EventKind;
  initial: ItemFormValues;
  allDay: boolean;
  /** this のときは繰り返しの設定は変更できない（回の行は繰り返さない） */
  scope?: RecurrenceScope;
  onSubmit: (input: CreateEventBody) => Promise<unknown>;
  onSaved: () => void;
}) {
  const thisOnly = scope === 'this';
  const formRef = useRef<HTMLFormElement>(null);
  /** 今の入力 → 検証前の値。保存のほか、入力を下書きへ映し戻す（クイック入力）のにも使う */
  const inputFromForm = (fd: FormData) =>
    itemInputFromForm(kind, fd, { initial, allDay, thisOnly });

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

  return {
    ...form,
    thisOnly,
    /** 入力欄の form（`RecordSheet` の formRef、クイック入力の form に渡す） */
    formRef,
    /** 今の入力欄の値（検証前）。フォームがまだ無ければ null */
    readInput: () => formRef.current && inputFromForm(new FormData(formRef.current)),
    /** `RecordSheet` にそのまま広げる props（`useFormSubmit` の sheet と form） */
    sheet: { ...form.sheet, formRef },
  };
}

/**
 * 予定・タスクの種類の切り替え（入力の上端の `KindToggle`）。切り替えた種類と、その既定値を持つ。
 * 既定値は切り替えたときの入力の開始から作り直す（引き継ぐ日時は開始だけ。`switchKindValues`）。
 * タイトル・参加者・場所・メモ・繰り返し・開始前の通知の入力欄は種類で変わらないので、入力した値は
 * 入力欄（DOM）にそのまま残る。作り直すのは種類で変わる日時の入力欄と期限前の通知だけ。
 * 繰り返しの 1 回だけ（this）は種類を変えられない（回の種類は繰り返し元のもの）ので、呼び出し側が切り替えを出さない。
 */
export function useKindSwitch(kind: EventKind, initial: ItemFormValues) {
  const [switched, setSwitched] = useState<{ kind: EventKind; initial: ItemFormValues } | null>(
    null,
  );
  const current = switched ?? { kind, initial };
  return {
    ...current,
    /** 種類を to にする。input は切り替える前の入力（読めなければ今の既定値の開始を引き継ぐ） */
    switchTo: (to: EventKind, input: { allDay: boolean; startsAt: string | null } | null) =>
      setSwitched({
        kind: to,
        initial: switchKindValues(current.initial, input ?? current.initial, to),
      }),
  };
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
