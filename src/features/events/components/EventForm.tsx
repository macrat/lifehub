import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { isDateString } from '../../../../shared/date.ts';
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
import { formList, formSelect, formText, SELECT_NONE, useFormSubmit } from '../../../lib/form.ts';
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

/** 予定のフォーム。開始・終了は必須で、通知は開始前だけを扱う。 */
export function EventForm({ title, initial, scope = 'all', onSubmit, onClose }: Props) {
  const [allDay, setAllDay] = useState(initial.allDay);
  const thisOnly = scope === 'this';
  const initialStart = initial.startsAt ?? new Date().toISOString();
  const initialEnd = initial.endsAt ?? initialStart;

  const { errors, submitError, submitting, handleSubmit } = useFormSubmit({
    schema: createEventSchema,
    values: (fd) => {
      const startsRaw = formText(fd, 'startsAt');
      const endsRaw = formText(fd, 'endsAt');
      const toInstant = (raw: string) =>
        allDay && isDateString(raw) ? fromDateValue(raw) : fromDateTimeLocalValue(raw);
      return {
        kind: 'event',
        title: formText(fd, 'title') ?? '',
        allDay,
        startsAt: startsRaw ? toInstant(startsRaw) : null,
        endsAt: endsRaw ? toInstant(endsRaw) : null,
        participantIds: formList(fd, 'participantIds'),
        location: formText(fd, 'location'),
        note: formText(fd, 'note'),
        rrule: thisOnly ? initial.rrule : formText(fd, 'rrule'),
        remindStartMinutes:
          formSelect(fd, 'remindStartMinutes') === null
            ? null
            : Number(formText(fd, 'remindStartMinutes')),
        remindEndMinutes: initial.remindEndMinutes,
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
      submitting={submitting}
      error={submitError}
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
              defaultValue={toDateString(new Date(initialStart))}
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
                initial.allDay ? inclusiveEndDate(initialEnd) : toDateString(new Date(initialEnd))
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
              defaultValue={toDateTimeLocalValue(initialStart)}
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
              defaultValue={toDateTimeLocalValue(initialEnd)}
              error={Boolean(errors.endsAt)}
              helperText={errors.endsAt}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />
          </>
        )}
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
      <TextField
        name="remindStartMinutes"
        label="通知"
        select
        defaultValue={initial.remindStartMinutes ?? SELECT_NONE}
        fullWidth
      >
        <MenuItem value={SELECT_NONE}>通知しない</MenuItem>
        {REMIND_BEFORE_OPTIONS.map((m) => (
          <MenuItem key={m} value={m}>
            {REMIND_LABELS[m]}
          </MenuItem>
        ))}
      </TextField>
    </FormDialog>
  );
}
