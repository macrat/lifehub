import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import type { DateString } from '../../../../shared/types.ts';
import { createEventSchema, type RecurrenceScope } from '../../../../shared/validation/events.ts';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '../../../lib/date.ts';
import { formList, formText, useFormSubmit } from '../../../lib/form.ts';
import { FormDialog } from '../../../lib/ui/FormDialog.tsx';
import { SubmitButton } from '../../../lib/ui/SubmitButton.tsx';
import { ParticipantsField } from '../../users/components/ParticipantsField.tsx';
import type { CreateEventBody } from '../queries.ts';
import { RecurrenceFields } from './RecurrenceFields.tsx';

export type TaskFormValues = {
  title: string;
  note: string | null;
  participantIds: string[];
  startsAt: string | null;
  /** 期限 */
  endsAt: string | null;
  rrule: string | null;
  /** 0 = 開始時刻に通知、null = 通知しない */
  remindStartMinutes: number | null;
  /** 0 = 期限に通知、null = 通知しない */
  remindEndMinutes: number | null;
};

type Props = {
  title: string;
  initial: TaskFormValues;
  /** this のときは繰り返しの設定は変更できない（回の行は繰り返さない） */
  scope?: RecurrenceScope;
  onSubmit: (input: CreateEventBody) => Promise<unknown>;
  onClose: () => void;
};

/** 既定値: 参加者は全員 */
export function defaultTaskValues(date?: DateString): TaskFormValues {
  return {
    title: '',
    note: null,
    participantIds: [],
    startsAt: date ? new Date(`${date}T09:00:00+09:00`).toISOString() : null,
    endsAt: null,
    rrule: null,
    remindStartMinutes: null,
    remindEndMinutes: null,
  };
}

export function TaskForm({ title, initial, scope = 'all', onSubmit, onClose }: Props) {
  const thisOnly = scope === 'this';

  const { errors, submitError, submitting, handleSubmit } = useFormSubmit({
    schema: createEventSchema,
    values: (fd) => {
      const startsRaw = formText(fd, 'startsAt');
      const endsRaw = formText(fd, 'endsAt');
      return {
        kind: 'task',
        title: formText(fd, 'title') ?? '',
        allDay: false,
        note: formText(fd, 'note'),
        participantIds: formList(fd, 'participantIds'),
        startsAt: startsRaw ? fromDateTimeLocalValue(startsRaw) : null,
        endsAt: endsRaw ? fromDateTimeLocalValue(endsRaw) : null,
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
    onSuccess: onClose,
  });

  return (
    <FormDialog
      onClose={onClose}
      maxWidth="sm"
      title={title}
      onSubmit={handleSubmit}
      actions={
        <>
          <Button onClick={onClose}>キャンセル</Button>
          <SubmitButton disabled={submitting} />
        </>
      }
    >
      <Stack spacing={2} sx={{ mt: 1 }}>
        {submitError && <Alert severity="error">{submitError}</Alert>}
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
            helperText={errors.startsAt ?? '空欄なら今日から表示'}
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
      </Stack>
    </FormDialog>
  );
}
