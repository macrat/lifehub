import { useMemo } from 'react';
import type { EventKind } from '../../../shared/validation/events.ts';
import type { ItemFormValues } from '../events/form-values.ts';
import { grabbedScope } from '../events/recurrence-options.ts';
import { useItemForm } from '../events/use-item-form.ts';
import { eventDraftOps } from './event-draft.ts';
import { taskDraftOps } from './task-draft.ts';
import type { QuickProps } from './use-event-composer.ts';

/**
 * クイック入力の状態と操作（`useQuickForm`）が入れ物（`QuickForm`）に渡すもの。
 * 入れ物（シート・吹き出し）と項目は予定とタスクで同じで、違うのは上の段に出す日時と通知の項目（`kind`）だけ。
 */
export type Quick = {
  form: Pick<
    ReturnType<typeof useItemForm>,
    'formRef' | 'errors' | 'submitError' | 'thisOnly' | 'submitted' | 'handleSubmit'
  >;
  /** 入力の既定値（タイトルと、全項目のフォームへ引き継ぐ残りの項目） */
  initial: ItemFormValues;
  /** 下の段（PC は吹き出し）に出す日時の見出し */
  rangeText: string;
  /** 上の段で直した日時を下書き（見出しとグリッドの枠）へ映す。スマホのシートを下の段に戻すとき */
  syncDraft: () => void;
  /** 終日か（下書きが持つ） */
  allDay: boolean;
  changeAllDay: (allDay: boolean) => void;
  /** PC の「その他のオプション」で全項目のフォームへ引き継ぐ値 */
  expandValues: () => ItemFormValues;
  /**
   * 予定・タスクの切り替え。上の段で直した日時を先に下書きへ映してから切り替える
   * （引き継ぐ開始が、入力欄で直した開始になるように）
   */
  switchKind: (kind: EventKind) => void;
};

type Options = Pick<
  QuickProps,
  'draft' | 'onSubmit' | 'onChangeDraft' | 'onSwitchKind' | 'onClose'
>;

/**
 * クイック入力（予定・タスク）の状態と操作。日時と終日かどうかは下書き（`GridDraft`）だけが持ち、
 * 入力欄で直した日時は下書きへ戻す（見出し・グリッドの枠・保存する日時がいつも同じ下書きから決まるように）。
 * 入力欄の値はフォームの DOM が持つので、下書きへ映し戻すときも全項目のフォームへ引き継ぐときも、
 * フォーム（`useItemForm` の readInput）から読む。
 * つまんだ繰り返しの回はその回だけを直す（`grabbedScope`。回の行は繰り返さないので繰り返しの設定は触らせない）。
 *
 * 予定とタスクで 1 つのフックにし、種類で違う日時の扱いは下書きの種類ごとの扱い（`DraftOps`）に任せる。
 * WHY 1 つのフック: 入力の途中で種類を切り替えても、入れ物とタイトルなどの入力欄を作り直さないため
 * （フックが種類ごとに分かれると、それを呼ぶコンポーネントも分かれ、切り替えると入れ物ごと作り直して入力が消える）。
 */
export function useQuickForm({
  draft,
  onSubmit,
  onChangeDraft,
  onSwitchKind,
  onClose,
}: Options): Quick {
  const { range, item, task, participantIds } = draft;
  // 枠・直している物・タスクの日時から導く扱い。参加者を選び直しただけでは作り直さない
  const ops = useMemo(
    () => (task ? taskDraftOps(task, { range, item }) : eventDraftOps({ range, item })),
    [task, range, item],
  );
  const initial = { ...ops.values, participantIds };
  const { allDay } = initial;
  const form = useItemForm({
    initial,
    allDay,
    scope: grabbedScope(item),
    onSubmit,
    onSaved: onClose,
  });
  const { readInput } = form;

  /** 入力欄で直した日時を下書きへ映す。枠に置けない（範囲に出せない・開始が空・書きかけ）ならそのまま */
  const syncDraft = () => {
    const input = readInput();
    const change = input && ops.fromInput(input);
    if (change) onChangeDraft(change);
  };

  return {
    form,
    initial,
    rangeText: ops.rangeText,
    allDay,
    changeAllDay: (next: boolean) => onChangeDraft(ops.withAllDay(readInput(), next)),
    syncDraft,
    switchKind: (kind: EventKind) => {
      syncDraft();
      onSwitchKind(kind);
    },
    /** 入力済みのタイトルと参加者を既定値に重ねたもの。PC の吹き出しから全項目のフォームへ引き継ぐ */
    expandValues: (): ItemFormValues => {
      const input = readInput();
      return input
        ? { ...initial, title: input.title, participantIds: input.participantIds }
        : initial;
    },
  };
}
