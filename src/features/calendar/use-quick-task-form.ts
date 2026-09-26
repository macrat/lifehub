import { useMemo, useRef } from 'react';
import { grabbedScope } from '../events/recurrence-options.ts';
import { useAllDay, useItemForm } from '../events/use-item-form.ts';
import { expandValues, type Quick } from './quick-form.ts';
import { taskDraftFromInput, taskDraftText, taskDraftValues } from './task-draft.ts';
import type { QuickProps, TaskGridDraft } from './use-event-composer.ts';

type Options = Pick<QuickProps, 'onSubmit' | 'onChangeDraft' | 'onClose'> & {
  draft: TaskGridDraft;
};

/**
 * つまんで動かしたタスクのクイック入力（`QuickTaskForm`）の状態と操作。
 * 日時は枠（`draft.range`）とタスクから導き（`taskDraftValues`）、上の段で直した日時は下の段に戻るときに
 * 枠とタスクの両方へ戻す（`taskDraftFromInput`）。見出し・グリッドの枠・保存する日時が同じ所から決まるように。
 * 終日かどうかは予定と違ってフォームが持つ（タスクの終日は置き方ではなく日時の形なので、切り替えても枠は動かない）。
 */
export function useQuickTaskForm({ draft, onSubmit, onChangeDraft, onClose }: Options): Quick {
  const { range, item: task, participantIds } = draft;
  const formRef = useRef<HTMLFormElement>(null);
  // 枠とタスクから導く値。終日の状態（`useAllDay`）はこれが変わったとき（枠を動かしたとき）だけ合わせ直す
  // （描画ごとや参加者を選び直すたびに合わせ直すと、選んだ終日が戻ってしまう）
  const placed = useMemo(() => taskDraftValues(task, range), [task, range]);
  const [allDay, setAllDay] = useAllDay(placed.allDay, placed);
  const initial = { ...placed, participantIds };
  const form = useItemForm({
    kind: 'task',
    initial,
    allDay,
    // その回だけを直すときは、繰り返しの設定そのものは触らせない（回の行は繰り返さない）
    scope: grabbedScope(task),
    onSubmit,
    onSaved: onClose,
  });

  return {
    formRef,
    form,
    initial,
    allDay,
    changeAllDay: setAllDay,
    rangeText: taskDraftText(placed),
    expandValues: () => expandValues(formRef, form, initial),
    /** 入力欄で直した日時を枠とタスクへ映す。開始が空なら枠に置けないのでそのままにする */
    syncDraft: () => {
      if (!formRef.current) return;
      const next = taskDraftFromInput(task, form.inputFromForm(new FormData(formRef.current)));
      if (next) onChangeDraft(next);
    },
  };
}
