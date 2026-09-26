import type { RefObject } from 'react';
import type { ItemFormValues } from '../events/form-values.ts';
import type { useItemForm } from '../events/use-item-form.ts';

/**
 * クイック入力の中身（予定は `useQuickEventForm`、タスクは `useQuickTaskForm`）が入れ物（`QuickForm`）に渡すもの。
 * 入れ物（シート・吹き出し）と項目は予定とタスクで同じで、違うのは上の段に出す日時と通知の項目（`kind`）だけ。
 */
export type Quick = {
  formRef: RefObject<HTMLFormElement | null>;
  form: Pick<
    ReturnType<typeof useItemForm>,
    'errors' | 'submitError' | 'thisOnly' | 'submitted' | 'handleSubmit' | 'inputFromForm'
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
  /** PC の「その他のオプション」で全項目のフォームへ引き継ぐ値（`expandValues`） */
  expandValues: () => ItemFormValues;
};

/** 入力済みのタイトルと参加者を既定値に重ねたもの。PC の吹き出しから全項目のフォームへ引き継ぐ */
export function expandValues(
  formRef: RefObject<HTMLFormElement | null>,
  form: Pick<Quick['form'], 'inputFromForm'>,
  initial: ItemFormValues,
): ItemFormValues {
  const input = form.inputFromForm(new FormData(formRef.current ?? undefined));
  return { ...initial, title: input.title, participantIds: input.participantIds };
}
