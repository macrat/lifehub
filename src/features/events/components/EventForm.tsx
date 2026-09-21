import type { RecurrenceScope } from '../../../../shared/validation/events.ts';
import { RecordSheet } from '../../../lib/ui/RecordSheet.tsx';
import type { ItemFormValues } from '../form-values.ts';
import type { CreateEventBody } from '../queries.ts';
import { useItemForm } from '../use-item-form.ts';
import { EventFormFields } from './EventFields.tsx';

type Props = {
  title: string;
  initial: ItemFormValues;
  /** this のときは繰り返しの設定は変更できない（回の行は繰り返さない） */
  scope?: RecurrenceScope;
  onSubmit: (input: CreateEventBody) => Promise<unknown>;
  onClose: () => void;
};

/**
 * 予定を追加する。開始・終了は必須で、通知は開始前だけを扱う。
 * 既存の予定の編集は詳細（`ItemDetailSheet`）から行う。
 */
export function EventForm({ title, initial, scope, onSubmit, onClose }: Props) {
  const { allDay, setAllDay, thisOnly, errors, submitError, submitted, handleSubmit } = useItemForm(
    { kind: 'event', initial, scope, onSubmit, onSaved: onClose },
  );

  return (
    <RecordSheet
      open={!submitted}
      error={submitError}
      onClose={onClose}
      full
      title={title}
      onSubmit={handleSubmit}
    >
      <EventFormFields
        initial={initial}
        errors={errors}
        allDay={allDay}
        onChangeAllDay={setAllDay}
        thisOnly={thisOnly}
      />
    </RecordSheet>
  );
}
