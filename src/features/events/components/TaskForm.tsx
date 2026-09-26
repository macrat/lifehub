import type { RecurrenceScope } from '../../../../shared/validation/events.ts';
import { RecordSheet } from '../../../lib/ui/RecordSheet.tsx';
import type { ItemFormValues } from '../form-values.ts';
import type { CreateEventBody } from '../queries.ts';
import { useAllDay, useItemForm } from '../use-item-form.ts';
import { TaskFormFields } from './EventFields.tsx';

type Props = {
  initial: ItemFormValues;
  /** this のときは繰り返しの設定は変更できない（回の行は繰り返さない） */
  scope?: RecurrenceScope;
  /**
   * 既にあるタスクを直しているか（カレンダーでつまんだタスクのクイック入力から来たとき）。
   * 見出しが「編集」になり、タイトルに焦点を当てない（焦点は追加だけ。`TaskFormFields`）
   */
  editing?: boolean;
  onSubmit: (input: CreateEventBody) => Promise<unknown>;
  onClose: () => void;
};

/**
 * タスクを追加する。開始・期限はどちらも任意で（終日なら日付だけ）、通知は「開始に」「期限に」の 2 択。
 * 既存のタスクの編集は詳細（`ItemDetailSheet`）から行う。カレンダーでつまんだタスクをクイック入力の
 * 「その他のオプション」から直し続けるときもここへ来る（何を保存するかは `onSubmit` を渡す側が決める）。
 */
export function TaskForm({ initial, scope, editing = false, onSubmit, onClose }: Props) {
  const [allDay, setAllDay] = useAllDay(initial);
  const { thisOnly, errors, sheet } = useItemForm({
    kind: 'task',
    initial,
    allDay,
    scope,
    onSubmit,
    onSaved: onClose,
  });

  return (
    <RecordSheet
      {...sheet}
      onClose={onClose}
      full
      title={editing ? 'タスクを編集' : 'タスクを追加'}
    >
      <TaskFormFields
        initial={initial}
        errors={errors}
        allDay={allDay}
        onChangeAllDay={setAllDay}
        thisOnly={thisOnly}
        autoFocus={!editing}
      />
    </RecordSheet>
  );
}
