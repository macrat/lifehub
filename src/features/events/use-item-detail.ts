import { useQuery } from '@tanstack/react-query';
import { isCompletedTask } from '../../../shared/calendar.ts';
import type { CalendarItem } from '../calendar/queries.ts';
import type { ItemFormValues } from './form-values.ts';
import {
  eventQueryOptions,
  useDeleteEvent,
  useToggleCompletion,
  useUpdateEvent,
} from './queries.ts';
import { writeTarget } from './recurrence-options.ts';
import { useAllDay, useItemForm } from './use-item-form.ts';
import { useRecurrenceEditing } from './use-recurrence-editing.ts';

/**
 * 予定・タスクの詳細（`ItemDetailSheet`）の状態と操作。閲覧から編集への切り替え（繰り返しなら範囲の
 * 選択を挟む）、編集の初期値、保存・削除・完了の切り替えをまとめ、シートには表示するものだけを返す。
 * どの操作も済んだら詳細を閉じる（`onClose`）。
 */
export function useItemDetail(item: CalendarItem, initialEditing: boolean, onClose: () => void) {
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();
  const toggle = useToggleCompletion();
  const recurrence = useRecurrenceEditing({
    isRecurring: item.isRecurring,
    editing: initialEditing,
    onDelete: (scope) => {
      deleteEvent.mutate(writeTarget(item, scope));
      onClose();
    },
  });
  const { editScope } = recurrence;
  // 「すべて」の編集は繰り返し元（先頭の回の日時）から始めるので取り直す
  const master = useQuery({
    ...eventQueryOptions(item.id),
    enabled: editScope === 'all' && item.isRecurring,
  });

  const completed = isCompletedTask(item);
  // この回だけ／これ以降は開いている回の値から、すべては繰り返し元の値から始める
  const values: ItemFormValues | null =
    editScope === 'all' && item.isRecurring ? (master.data ?? null) : item;

  const initial = values ?? item;
  const [allDay, setAllDay] = useAllDay(initial);
  const form = useItemForm({
    kind: item.kind,
    initial,
    allDay,
    scope: editScope ?? 'all',
    onSubmit: (input) =>
      updateEvent.mutateAsync({ ...input, ...writeTarget(item, editScope ?? 'all') }),
    onSaved: onClose,
  });

  return {
    recurrence,
    /** 入力欄の初期値。繰り返し元を読んでいる間は null で、まだ入力欄に変えない（違う日時のまま出さない） */
    values: editScope === null ? null : values,
    allDay,
    setAllDay,
    form,
    completed,
    toggleCompletion: () => {
      toggle.mutate({ id: item.id, occurrenceStart: item.occurrenceStart, completed: !completed });
      onClose();
    },
  };
}
