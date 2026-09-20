import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { isDateString } from '../../../../shared/date.ts';
import type { DateString } from '../../../../shared/types.ts';
import {
  createEventSchema,
  REMIND_BEFORE_OPTIONS,
  type RecurrenceScope,
} from '../../../../shared/validation/events.ts';
import {
  fromDateTimeLocalValue,
  fromDateValue,
  inclusiveEndDate,
  toDateString,
  toDateTimeLocalValue,
} from '../../../lib/date.ts';
import { formSelect, formText, SELECT_NONE, useFormSubmit } from '../../../lib/form.ts';
import { FormDialog } from '../../../lib/ui/FormDialog.tsx';
import { SubmitButton } from '../../../lib/ui/SubmitButton.tsx';
import { OwnerSelect } from '../../users/components/OwnerSelect.tsx';
import type { CreateEventBody } from '../queries.ts';
import { RecurrenceFields } from './RecurrenceFields.tsx';

export type EventFormValues = {
  title: string;
  allDay: boolean;
  startsAt: string;
  endsAt: string;
  ownerUserId: string | null;
  location: string | null;
  note: string | null;
  rrule: string | null;
  remindBeforeMinutes: number | null;
};

type Props = {
  title: string;
  initial: EventFormValues;
  /** this のときは繰り返し・所有者・通知の変更はできない（この回だけの変更は日時・タイトル・メモのみ） */
  scope?: RecurrenceScope;
  onSubmit: (input: CreateEventBody) => Promise<unknown>;
  onClose: () => void;
};

const REMIND_LABELS: Record<number, string> = {
  0: '開始時刻',
  5: '5分前',
  10: '10分前',
  15: '15分前',
  30: '30分前',
  60: '1時間前',
  120: '2時間前',
  1440: '1日前',
};

/** 既定値: 次の正時から 1 時間 */
export function defaultEventValues(date?: DateString): EventFormValues {
  const base = date ? new Date(`${date}T10:00:00+09:00`) : new Date();
  if (!date) {
    base.setMinutes(0, 0, 0);
    base.setHours(base.getHours() + 1);
  }
  const end = new Date(base.getTime() + 60 * 60 * 1000);
  return {
    title: '',
    allDay: false,
    startsAt: base.toISOString(),
    endsAt: end.toISOString(),
    ownerUserId: null,
    location: null,
    note: null,
    rrule: null,
    remindBeforeMinutes: null,
  };
}

export function EventForm({ title, initial, scope = 'all', onSubmit, onClose }: Props) {
  const [allDay, setAllDay] = useState(initial.allDay);
  const thisOnly = scope === 'this';

  const { errors, submitError, submitting, handleSubmit } = useFormSubmit({
    schema: createEventSchema,
    values: (fd) => {
      const startsRaw = formText(fd, 'startsAt');
      const endsRaw = formText(fd, 'endsAt');
      const toInstant = (raw: string) =>
        allDay && isDateString(raw) ? fromDateValue(raw) : fromDateTimeLocalValue(raw);
      return {
        title: formText(fd, 'title') ?? '',
        allDay,
        startsAt: startsRaw ? toInstant(startsRaw) : '',
        endsAt: endsRaw ? toInstant(endsRaw) : '',
        ownerUserId: thisOnly ? initial.ownerUserId : formSelect(fd, 'ownerUserId'),
        location: formText(fd, 'location'),
        note: formText(fd, 'note'),
        rrule: thisOnly ? initial.rrule : formText(fd, 'rrule'),
        remindBeforeMinutes: thisOnly
          ? initial.remindBeforeMinutes
          : formSelect(fd, 'remindBeforeMinutes') === null
            ? null
            : Number(formText(fd, 'remindBeforeMinutes')),
      };
    },
    onSubmit: (data) =>
      onSubmit({
        ...data,
        startsAt: data.startsAt.toISOString(),
        endsAt: data.endsAt.toISOString(),
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
        <FormControlLabel
          control={<Switch checked={allDay} onChange={(_, v) => setAllDay(v)} />}
          label="終日"
        />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          {allDay ? (
            <>
              <TextField
                key="start-date"
                name="startsAt"
                label="開始日"
                type="date"
                defaultValue={toDateString(new Date(initial.startsAt))}
                error={Boolean(errors.startsAt)}
                helperText={errors.startsAt}
                slotProps={{ inputLabel: { shrink: true } }}
                fullWidth
              />
              <TextField
                key="end-date"
                name="endsAt"
                label="終了日"
                type="date"
                defaultValue={
                  initial.allDay
                    ? inclusiveEndDate(initial.endsAt)
                    : toDateString(new Date(initial.endsAt))
                }
                error={Boolean(errors.endsAt)}
                helperText={errors.endsAt}
                slotProps={{ inputLabel: { shrink: true } }}
                fullWidth
              />
            </>
          ) : (
            <>
              <TextField
                key="start-datetime"
                name="startsAt"
                label="開始"
                type="datetime-local"
                defaultValue={toDateTimeLocalValue(initial.startsAt)}
                error={Boolean(errors.startsAt)}
                helperText={errors.startsAt}
                slotProps={{ inputLabel: { shrink: true } }}
                fullWidth
              />
              <TextField
                key="end-datetime"
                name="endsAt"
                label="終了"
                type="datetime-local"
                defaultValue={toDateTimeLocalValue(initial.endsAt)}
                error={Boolean(errors.endsAt)}
                helperText={errors.endsAt}
                slotProps={{ inputLabel: { shrink: true } }}
                fullWidth
              />
            </>
          )}
        </Stack>
        {!thisOnly && (
          <OwnerSelect name="ownerUserId" label="誰の予定" defaultValue={initial.ownerUserId} />
        )}
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
        {!thisOnly && (
          <TextField
            name="remindBeforeMinutes"
            label="通知"
            select
            defaultValue={initial.remindBeforeMinutes ?? SELECT_NONE}
            fullWidth
          >
            <MenuItem value={SELECT_NONE}>通知しない</MenuItem>
            {REMIND_BEFORE_OPTIONS.map((m) => (
              <MenuItem key={m} value={m}>
                {REMIND_LABELS[m]}
              </MenuItem>
            ))}
          </TextField>
        )}
      </Stack>
    </FormDialog>
  );
}
