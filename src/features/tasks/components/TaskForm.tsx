import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import type { DateString } from '../../../../shared/types.ts';
import type { RecurrenceScope } from '../../../../shared/validation/events.ts';
import { createTaskSchema } from '../../../../shared/validation/tasks.ts';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '../../../lib/date.ts';
import { formSelect, formText, useFormSubmit } from '../../../lib/form.ts';
import { FormDialog } from '../../../lib/ui/FormDialog.tsx';
import { SubmitButton } from '../../../lib/ui/SubmitButton.tsx';
import { RecurrenceFields } from '../../events/components/RecurrenceFields.tsx';
import { OwnerSelect } from '../../users/components/OwnerSelect.tsx';
import type { CreateTaskBody } from '../queries.ts';

export type TaskFormValues = {
  title: string;
  note: string | null;
  assigneeUserId: string | null;
  startsAt: string | null;
  dueAt: string | null;
  rrule: string | null;
  notifyAtStart: boolean;
  notifyAtDue: boolean;
};

type Props = {
  title: string;
  initial: TaskFormValues;
  /** this のときは担当・繰り返し・通知は変更できない（この回だけの変更は日時・タイトル・メモのみ） */
  scope?: RecurrenceScope;
  onSubmit: (input: CreateTaskBody) => Promise<unknown>;
  onClose: () => void;
};

export function defaultTaskValues(date?: DateString): TaskFormValues {
  return {
    title: '',
    note: null,
    assigneeUserId: null,
    startsAt: date ? new Date(`${date}T09:00:00+09:00`).toISOString() : null,
    dueAt: null,
    rrule: null,
    notifyAtStart: false,
    notifyAtDue: false,
  };
}

export function TaskForm({ title, initial, scope = 'all', onSubmit, onClose }: Props) {
  const thisOnly = scope === 'this';

  const { errors, submitError, submitting, handleSubmit } = useFormSubmit({
    schema: createTaskSchema,
    values: (fd) => {
      const startsRaw = formText(fd, 'startsAt');
      const dueRaw = formText(fd, 'dueAt');
      return {
        title: formText(fd, 'title') ?? '',
        note: formText(fd, 'note'),
        assigneeUserId: thisOnly ? initial.assigneeUserId : formSelect(fd, 'assigneeUserId'),
        startsAt: startsRaw ? fromDateTimeLocalValue(startsRaw) : null,
        dueAt: dueRaw ? fromDateTimeLocalValue(dueRaw) : null,
        rrule: thisOnly ? initial.rrule : formText(fd, 'rrule'),
        notifyAtStart: thisOnly ? initial.notifyAtStart : fd.get('notifyAtStart') === 'on',
        notifyAtDue: thisOnly ? initial.notifyAtDue : fd.get('notifyAtDue') === 'on',
      };
    },
    onSubmit: (data) =>
      onSubmit({
        ...data,
        startsAt: data.startsAt?.toISOString() ?? null,
        dueAt: data.dueAt?.toISOString() ?? null,
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
            name="dueAt"
            label="期限日時"
            type="datetime-local"
            defaultValue={initial.dueAt ? toDateTimeLocalValue(initial.dueAt) : ''}
            error={Boolean(errors.dueAt)}
            helperText={errors.dueAt}
            slotProps={{ inputLabel: { shrink: true } }}
            fullWidth
          />
        </Stack>
        {!thisOnly && (
          <OwnerSelect name="assigneeUserId" label="担当" defaultValue={initial.assigneeUserId} />
        )}
        <TextField
          name="note"
          label="メモ"
          defaultValue={initial.note ?? ''}
          multiline
          minRows={2}
          fullWidth
        />
        {!thisOnly && <RecurrenceFields initial={initial.rrule} error={errors.rrule} />}
        {!thisOnly && (
          <Stack direction="row" spacing={2}>
            <FormControlLabel
              control={<Checkbox name="notifyAtStart" defaultChecked={initial.notifyAtStart} />}
              label="開始日時に通知"
            />
            <FormControlLabel
              control={<Checkbox name="notifyAtDue" defaultChecked={initial.notifyAtDue} />}
              label="期限日時に通知"
            />
          </Stack>
        )}
      </Stack>
    </FormDialog>
  );
}
