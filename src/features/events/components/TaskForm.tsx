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
  onSubmit: (input: CreateEventBody) => Promise<unknown>;
  onClose: () => void;
};

/**
 * タスクを追加する。開始・期限はどちらも任意で（終日なら日付だけ）、通知は「開始に」「期限に」の 2 択。
 * 既存のタスクの編集は詳細（`ItemDetailSheet`）から行う。
 */
export function TaskForm({ initial, scope, onSubmit, onClose }: Props) {
  const [allDay, setAllDay] = useAllDay(initial);
  const { thisOnly, errors, submitError, submitted, handleSubmit } = useItemForm({
    kind: 'task',
    initial,
    allDay,
    scope,
    onSubmit,
    onSaved: onClose,
  });

  return (
    <RecordSheet
      open={!submitted}
      error={submitError}
      onClose={onClose}
      full
      title="タスクを追加"
      onSubmit={handleSubmit}
    >
      <TaskFormFields
        initial={initial}
        errors={errors}
        allDay={allDay}
        onChangeAllDay={setAllDay}
        thisOnly={thisOnly}
        autoFocus
      />
    </RecordSheet>
  );
}
