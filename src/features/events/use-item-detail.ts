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
  // この回だけ／これ以降は開いている回の値から、すべては繰り返し元（先頭の回の日時）の値から始める
  const fromMaster = editScope === 'all' && item.isRecurring;
  const master = useQuery({ ...eventQueryOptions(item.id), enabled: fromMaster });
  const scope = editScope ?? 'all';

  const completed = isCompletedTask(item);
  const initial: ItemFormValues = (fromMaster ? master.data : undefined) ?? item;
  const [allDay, setAllDay] = useAllDay(initial);
  const form = useItemForm({
    kind: item.kind,
    initial,
    allDay,
    scope,
    onSubmit: (input) => updateEvent.mutateAsync({ ...input, ...writeTarget(item, scope) }),
    onSaved: onClose,
  });
  // 編集で開いているか。繰り返し元を読んでいる間はまだ入力欄に変えない（違う日時のまま出さない）
  const editing = editScope !== null && (!fromMaster || master.data !== undefined);

  return {
    /** 入力欄に渡すもの。閲覧中は null */
    fields: editing
      ? { initial, errors: form.errors, allDay, onChangeAllDay: setAllDay, thisOnly: form.thisOnly }
      : null,
    /** 繰り返しのどの範囲を直しているか（範囲の印を出す）。繰り返しでない・閲覧中は null */
    editScope: editing && item.isRecurring ? editScope : null,
    /** 範囲の選択を待っている操作（繰り返しのときだけ）。無ければ null */
    pendingScope: recurrence.pending,
    selectScope: recurrence.selectScope,
    cancelScope: recurrence.cancel,
    startEdit: () => recurrence.start('edit'),
    startDelete: () => recurrence.start('delete'),
    form,
    completed,
    toggleCompletion: () => {
      toggle.mutate({ id: item.id, occurrenceStart: item.occurrenceStart, completed: !completed });
      onClose();
    },
  };
}
