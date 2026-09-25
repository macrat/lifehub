import { useMemo, useRef } from 'react';
import { grabbedScope } from '../events/recurrence-options.ts';
import { useAllDay, useItemForm } from '../events/use-item-form.ts';
import type { QuickProps } from './components/QuickForm.tsx';
import { type TaskItem, taskDraftFromInput, taskDraftText, taskDraftValues } from './task-draft.ts';

type Options = Pick<QuickProps, 'draft' | 'onSubmit' | 'onChangeDraft' | 'onClose'> & {
  /** 直しているタスク（`draft.item` と同じもの。タスクだと分かっている形で受け取る） */
  task: TaskItem;
};

/**
 * つまんで動かしたタスクのクイック入力（`QuickTaskForm`）の状態と操作。
 * 日時は枠（`draft.range`）とタスクから導き（`taskDraftValues`）、上の段で直した日時は下の段に戻るときに
 * 枠とタスクの両方へ戻す（`taskDraftFromInput`）。見出し・グリッドの枠・保存する日時が同じ所から決まるように。
 * 終日かどうかは予定と違ってフォームが持つ（タスクの終日は置き方ではなく日時の形なので、切り替えても枠は動かない）。
 */
export function useQuickTaskForm({ draft, task, onSubmit, onChangeDraft, onClose }: Options) {
  const { range, participantIds } = draft;
  const formRef = useRef<HTMLFormElement>(null);
  // 描画ごとに作り直すと、終日の状態（`useAllDay`）が別の既定値と見て毎回戻してしまう
  const initial = useMemo(
    () => taskDraftValues(task, range, participantIds),
    [task, range, participantIds],
  );
  const [allDay, setAllDay] = useAllDay(initial);
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
    rangeText: taskDraftText(initial),
    /** 入力欄で直した日時を枠とタスクへ映す。開始が空なら枠に置けないのでそのままにする */
    syncDraft: () => {
      if (!formRef.current) return;
      const next = taskDraftFromInput(task, form.inputFromForm(new FormData(formRef.current)));
      if (next) onChangeDraft(next);
    },
  };
}
