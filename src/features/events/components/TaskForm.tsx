import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { createEventSchema, type RecurrenceScope } from '../../../../shared/validation/events.ts';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '../../../lib/date.ts';
import { formList, formText, useFormSubmit } from '../../../lib/form.ts';
import { FormDialog } from '../../../lib/ui/FormDialog.tsx';
import { ParticipantsField } from '../../users/components/ParticipantsField.tsx';
import type { ItemFormValues } from '../form-values.ts';
import type { CreateEventBody } from '../queries.ts';
import { RecurrenceFields } from './RecurrenceFields.tsx';

type Props = {
  title: string;
  initial: ItemFormValues;
  /** this のときは繰り返しの設定は変更できない（回の行は繰り返さない） */
  scope?: RecurrenceScope;
  onSubmit: (input: CreateEventBody) => Promise<unknown>;
  onClose: () => void;
};

/** タスクのフォーム。開始・期限はどちらも任意で、通知は「開始日時に」「期限日時に」（= 0 分前）の 2 択。 */
export function TaskForm({ title, initial, scope = 'all', onSubmit, onClose }: Props) {
  const thisOnly = scope === 'this';

  const { errors, submitError, submitted, handleSubmit } = useFormSubmit({
    schema: createEventSchema,
    values: (fd) => {
      const startsRaw = formText(fd, 'startsAt');
      const endsRaw = formText(fd, 'endsAt');
      return {
        kind: 'task',
        title: formText(fd, 'title') ?? '',
        allDay: initial.allDay,
        startsAt: startsRaw ? fromDateTimeLocalValue(startsRaw) : null,
        endsAt: endsRaw ? fromDateTimeLocalValue(endsRaw) : null,
        participantIds: formList(fd, 'participantIds'),
        location: formText(fd, 'location'),
        note: formText(fd, 'note'),
        rrule: thisOnly ? initial.rrule : formText(fd, 'rrule'),
        remindStartMinutes: fd.get('notifyAtStart') === 'on' ? 0 : null,
        remindEndMinutes: fd.get('notifyAtEnd') === 'on' ? 0 : null,
      };
    },
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
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          name="startsAt"
          label="開始日時"
          type="datetime-local"
          defaultValue={initial.startsAt ? toDateTimeLocalValue(initial.startsAt) : ''}
          error={Boolean(errors.startsAt)}
          helperText={errors.startsAt}
          slotProps={{ inputLabel: { shrink: true } }}
          fullWidth
        />
        <TextField
          name="endsAt"
          label="期限日時"
          type="datetime-local"
          defaultValue={initial.endsAt ? toDateTimeLocalValue(initial.endsAt) : ''}
          error={Boolean(errors.endsAt)}
          helperText={errors.endsAt}
          slotProps={{ inputLabel: { shrink: true } }}
          fullWidth
        />
      </Stack>
      <ParticipantsField
        name="participantIds"
        defaultValue={initial.participantIds}
        error={errors.participantIds}
      />
      <TextField name="location" label="場所" defaultValue={initial.location ?? ''} fullWidth />
      <TextField
        name="note"
        label="メモ"
        defaultValue={initial.note ?? ''}
        multiline
        minRows={2}
        fullWidth
      />
      {!thisOnly && <RecurrenceFields initial={initial.rrule} error={errors.rrule} />}
      <Stack direction="row" spacing={2}>
        <FormControlLabel
          control={
            <Checkbox name="notifyAtStart" defaultChecked={initial.remindStartMinutes !== null} />
          }
          label="開始日時に通知"
        />
        <FormControlLabel
          control={
            <Checkbox name="notifyAtEnd" defaultChecked={initial.remindEndMinutes !== null} />
          }
          label="期限日時に通知"
        />
      </Stack>
    </FormDialog>
  );
}
