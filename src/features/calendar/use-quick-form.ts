import { type RefObject, useRef } from 'react';
import type { CalendarItem } from '../../../shared/calendar.ts';
import type { ItemFormValues } from '../events/form-values.ts';
import { grabbedScope } from '../events/recurrence-options.ts';
import { useItemForm } from '../events/use-item-form.ts';
import type { QuickProps } from './use-event-composer.ts';

/**
 * クイック入力の中身（予定は `useQuickEventForm`、タスクは `useQuickTaskForm`）が入れ物（`QuickForm`）に渡すもの。
 * 入れ物（シート・吹き出し）と項目は予定とタスクで同じで、違うのは上の段に出す日時と通知の項目（`kind`）だけ。
 */
export type Quick = {
  formRef: RefObject<HTMLFormElement | null>;
  form: Pick<
    ReturnType<typeof useItemForm>,
    'errors' | 'submitError' | 'thisOnly' | 'submitted' | 'handleSubmit'
  >;
  /** 入力の既定値（タイトルと、全項目のフォームへ引き継ぐ残りの項目） */
  initial: ItemFormValues;
  /** 下の段（PC は吹き出し）に出す日時の見出し */
  rangeText: string;
  /** 上の段で直した日時を下書き（見出しとグリッドの枠）へ映す。スマホのシートを下の段に戻すとき */
  syncDraft: () => void;
  /** 終日か。予定は下書き、タスクはフォームが持つ（それぞれのフック） */
  allDay: boolean;
  changeAllDay: (allDay: boolean) => void;
  /** PC の「その他のオプション」で全項目のフォームへ引き継ぐ値（`useQuickForm` の expandValues） */
  expandValues: () => ItemFormValues;
};

/**
 * クイック入力（予定・タスク）で共通の、フォームの状態と読み出し。入力欄の値はフォームの DOM が持つので、
 * 下書きへ映し戻すときも全項目のフォームへ引き継ぐときも、`formRef` の form から読む。
 * つまんだ繰り返しの回はその回だけを直す（`grabbedScope`。回の行は繰り返さないので繰り返しの設定は触らせない）。
 */
export function useQuickForm({
  kind,
  initial,
  allDay,
  item,
  onSubmit,
  onClose,
}: {
  kind: 'event' | 'task';
  initial: ItemFormValues;
  allDay: boolean;
  /** つまんだ項目（追加の下書きなら null） */
  item: CalendarItem | null;
  onSubmit: QuickProps['onSubmit'];
  onClose: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const form = useItemForm({
    kind,
    initial,
    allDay,
    scope: grabbedScope(item),
    onSubmit,
    onSaved: onClose,
  });
  /** 今の入力欄の値（検証前）。フォームがまだ無ければ null */
  const readInput = () => formRef.current && form.inputFromForm(new FormData(formRef.current));
  return {
    formRef,
    form,
    readInput,
    /** 入力済みのタイトルと参加者を既定値に重ねたもの。PC の吹き出しから全項目のフォームへ引き継ぐ */
    expandValues: (): ItemFormValues => {
      const input = readInput();
      return input
        ? { ...initial, title: input.title, participantIds: input.participantIds }
        : initial;
    },
  };
}
