import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import UndoIcon from '@mui/icons-material/Undo';
import { useQueryClient } from '@tanstack/react-query';
import { type CalendarItem, isCompletedTask } from '../../../shared/calendar.ts';
import type { EventKind } from '../../../shared/validation/events.ts';
import { useStoreQuery } from '../../lib/screen-data.ts';
import type { MenuAction } from '../../lib/ui/ActionMenu.tsx';
import { deleteMenuAction } from '../../lib/ui/use-record-detail.tsx';
import type { ItemFormValues } from './form-values.ts';
import {
  eventQueryOptions,
  loadEvent,
  useDeleteEvent,
  useToggleCompletion,
  useUpdateEvent,
} from './queries.ts';
import { writeTarget } from './recurrence-options.ts';
import { useAllDay, useItemForm, useKindSwitch } from './use-item-form.ts';
import { useRecurrenceEditing } from './use-recurrence-editing.ts';

/**
 * 予定・タスクの詳細（`ItemDetailSheet`）の状態と操作。閲覧から編集への切り替え（繰り返しなら範囲の
 * 選択を挟む）、編集の初期値、保存・削除・完了の切り替え、三点リーダーの操作をまとめ、シートには
 * 表示するものだけを返す。どの操作も済んだら詳細を閉じる（`onClose`）。
 * 複製は詳細の代わりにフォームを出すことで、どちらを出すかはシートが持つので、始める処理（`onDuplicate`）を受け取る。
 */
export function useItemDetail(
  item: CalendarItem,
  initialEditing: boolean,
  onClose: () => void,
  onDuplicate: () => void,
) {
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();
  const toggle = useToggleCompletion();
  const queryClient = useQueryClient();
  const recurrence = useRecurrenceEditing({
    isRecurring: item.isRecurring,
    editing: initialEditing,
    // すべての回を直すなら、入力の初期値にする繰り返し元を読む
    onEdit: (scope) => {
      if (scope === 'all' && item.isRecurring) loadEvent(queryClient, item.id);
    },
    onDelete: (scope) => {
      deleteEvent.mutate(writeTarget(item, scope));
      onClose();
    },
  });
  const { editScope } = recurrence;
  // この回だけ／これ以降は開いている回の値から、すべては繰り返し元（先頭の回の日時）の値から始める
  const fromMaster = editScope === 'all' && item.isRecurring;
  const master = useStoreQuery(eventQueryOptions(item.id));
  const scope = editScope ?? 'all';

  const completed = isCompletedTask(item);
  // 編集の途中で種類（予定・タスク）を切り替えられる。切り替えたら、その既定値から入力し直す
  const { initial, switchTo } = useKindSwitch(
    ((fromMaster ? master.data : undefined) ?? item) satisfies ItemFormValues,
  );
  const [allDay, setAllDay] = useAllDay(initial.allDay, initial);
  const form = useItemForm({
    initial,
    allDay,
    scope,
    onSubmit: (input) => updateEvent.mutateAsync({ ...input, ...writeTarget(item, scope) }),
    onSaved: onClose,
  });
  // 編集で開いているか。繰り返し元を読んでいる間はまだ入力欄に変えない（違う日時のまま出さない）。
  // 手元に前の行があっても、取り直しが済むまで待つ: 入力欄は開いた時の値から始まる（制御しない）ので、
  // 古い行で開くと保存がそれを書き戻してしまう（行のキャッシュは 7 日残る）。
  // オフラインでは取得が保留（fetching ではない）になるので、待たずに手元の行で開く
  const editing =
    editScope !== null && (!fromMaster || (master.data !== undefined && !master.isFetching));

  return {
    /** 入力欄に渡すもの。閲覧中は null */
    fields: editing
      ? {
          initial,
          errors: form.errors,
          allDay,
          onChangeAllDay: setAllDay,
          thisOnly: form.thisOnly,
        }
      : null,
    /** 種類の切り替え。切り替えたときの入力の開始を引き継ぐ */
    switchKind: (to: EventKind) => switchTo(to, form.readInput()),
    /** 繰り返しのどの範囲を直しているか（範囲の印を出す）。繰り返しでない・閲覧中は null */
    editScope: editing && item.isRecurring ? editScope : null,
    /** 範囲の選択を待っている操作（繰り返しのときだけ）。無ければ null */
    pendingScope: recurrence.pending,
    selectScope: recurrence.selectScope,
    cancelScope: recurrence.cancel,
    startEdit: () => recurrence.start('edit'),
    form,
    completed,
    /** 三点リーダーの操作。タスクは完了（の取り消し）、どちらも複製と削除 */
    actions: [
      ...(item.kind === 'task'
        ? [
            {
              label: completed ? '完了を取り消す' : '完了にする',
              icon: completed ? <UndoIcon /> : <CheckCircleOutlineIcon />,
              onClick: () => {
                toggle.mutate({
                  id: item.id,
                  occurrenceStart: item.occurrenceStart,
                  completed: !completed,
                });
                onClose();
              },
            },
          ]
        : []),
      { label: '複製', icon: <ContentCopyIcon />, onClick: onDuplicate },
      deleteMenuAction(() => recurrence.start('delete')),
    ] satisfies MenuAction[],
  };
}
