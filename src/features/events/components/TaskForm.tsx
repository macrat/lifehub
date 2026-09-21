import type { RecurrenceScope } from '../../../../shared/validation/events.ts';
import { FormDialog } from '../../../lib/ui/FormDialog.tsx';
import type { ItemFormValues } from '../form-values.ts';
import type { CreateEventBody } from '../queries.ts';
import { useItemForm } from '../use-item-form.ts';
import { TaskFormFields } from './EventFields.tsx';

type Props = {
  title: string;
  initial: ItemFormValues;
  /** this のときは繰り返しの設定は変更できない（回の行は繰り返さない） */
  scope?: RecurrenceScope;
  onSubmit: (input: CreateEventBody) => Promise<unknown>;
  onClose: () => void;
};

/**
 * タスクを追加する。開始・期限はどちらも任意で、通知は「開始日時に」「期限日時に」（= 0 分前）の 2 択。
 * 既存のタスクの編集は詳細（`ItemDetailSheet`）から行う。
 */
export function TaskForm({ title, initial, scope, onSubmit, onClose }: Props) {
  const { thisOnly, errors, submitError, submitted, handleSubmit } = useItemForm({
    kind: 'task',
    initial,
    scope,
    onSubmit,
    onSaved: onClose,
  });

  return (
    <FormDialog
      open={!submitted}
      error={submitError}
      onClose={onClose}
      maxWidth="sm"
      title={title}
      onSubmit={handleSubmit}
    >
      <TaskFormFields initial={initial} errors={errors} thisOnly={thisOnly} />
    </FormDialog>
  );
}
