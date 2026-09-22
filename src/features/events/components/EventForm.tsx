import type { RecurrenceScope } from '../../../../shared/validation/events.ts';
import { RecordSheet } from '../../../lib/ui/RecordSheet.tsx';
import type { ItemFormValues } from '../form-values.ts';
import type { CreateEventBody } from '../queries.ts';
import { useItemForm } from '../use-item-form.ts';
import { EventFormFields } from './EventFields.tsx';

type Props = {
  initial: ItemFormValues;
  /** this のときは繰り返しの設定は変更できない（回の行は繰り返さない） */
  scope?: RecurrenceScope;
  /** 見出し。既定は追加（つまんだ予定を直しているときは呼び出し側が言い換える） */
  title?: string;
  onSubmit: (input: CreateEventBody) => Promise<unknown>;
  onClose: () => void;
};

/**
 * 予定の全項目のフォーム。開始・終了は必須で、通知は開始前だけを扱う。
 * 追加のほか、クイック入力の「その他のオプション」から直し続けるときもここへ来る
 * （何を保存するかは `onSubmit` を渡す側が決める）。詳細から開く編集は `ItemDetailSheet`。
 */
export function EventForm({ initial, scope, title = '予定を追加', onSubmit, onClose }: Props) {
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
