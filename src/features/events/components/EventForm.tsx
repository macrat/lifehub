import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { createEventSchema, type RecurrenceScope } from '../../../../shared/validation/events.ts';
import { useFormSubmit } from '../../../lib/form.ts';
import { FormDialog } from '../../../lib/ui/FormDialog.tsx';
import { ParticipantsField } from '../../users/components/ParticipantsField.tsx';
import { eventInputFromForm, type ItemFormValues } from '../form-values.ts';
import type { CreateEventBody } from '../queries.ts';
import { EventExtraFields, EventWhenFields } from './EventFields.tsx';

type Props = {
  title: string;
  initial: ItemFormValues;
  /** this のときは繰り返しの設定は変更できない（回の行は繰り返さない） */
  scope?: RecurrenceScope;
  onSubmit: (input: CreateEventBody) => Promise<unknown>;
  onClose: () => void;
};

/** 予定のフォーム。開始・終了は必須で、通知は開始前だけを扱う。 */
export function EventForm({ title, initial, scope = 'all', onSubmit, onClose }: Props) {
  const [allDay, setAllDay] = useState(initial.allDay);
  const thisOnly = scope === 'this';

  const { errors, submitError, submitted, handleSubmit } = useFormSubmit({
    schema: createEventSchema,
    values: (fd) => eventInputFromForm(fd, { initial, allDay, thisOnly }),
    onSubmit: (data) =>
      onSubmit({
        ...data,
        startsAt: data.startsAt?.toISOString() ?? null,
        endsAt: data.endsAt?.toISOString() ?? null,
      }),
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
      <TextField
        name="title"
        label="タイトル"
        defaultValue={initial.title}
        error={Boolean(errors.title)}
        helperText={errors.title}
        autoFocus
        fullWidth
      />
      <EventWhenFields
        initial={initial}
        errors={errors}
        allDay={allDay}
        onChangeAllDay={setAllDay}
      />
      <ParticipantsField
        name="participantIds"
        defaultValue={initial.participantIds}
        error={errors.participantIds}
      />
      <EventExtraFields initial={initial} errors={errors} thisOnly={thisOnly} />
    </FormDialog>
  );
}
