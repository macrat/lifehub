import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import { REMIND_BEFORE_OPTIONS } from '../../../../shared/validation/events.ts';
import { inclusiveEndDate, toDateString, toDateTimeLocalValue } from '../../../lib/date.ts';
import { type FormErrors, SELECT_NONE } from '../../../lib/form.ts';
import type { ItemFormValues } from '../form-values.ts';
import { RecurrenceFields } from './RecurrenceFields.tsx';

type Props = {
  initial: ItemFormValues;
  errors: FormErrors;
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

/**
 * 予定の日時（終日の切り替えと開始・終了）。全項目のフォーム（`EventForm`）と、
 * スマホで上の段まで広げたクイック入力（`QuickEventForm`）で同じものを使う。
 * 終日かどうかで日付だけ／日時に入れ替わるので、その状態だけ呼び出し側から受け取る。
 */
export function EventWhenFields({
  initial,
  errors,
  allDay,
  onChangeAllDay,
}: Props & { allDay: boolean; onChangeAllDay: (allDay: boolean) => void }) {
  const start = initial.startsAt ?? new Date().toISOString();
  const end = initial.endsAt ?? start;
  return (
    <>
      <FormControlLabel
        control={<Switch checked={allDay} onChange={(_, v) => onChangeAllDay(v)} />}
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
              defaultValue={toDateString(new Date(start))}
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
              defaultValue={initial.allDay ? inclusiveEndDate(end) : toDateString(new Date(end))}
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
              defaultValue={toDateTimeLocalValue(start)}
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
              defaultValue={toDateTimeLocalValue(end)}
              error={Boolean(errors.endsAt)}
              helperText={errors.endsAt}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />
          </>
        )}
      </Stack>
    </>
  );
}

/** 予定の残りの項目（場所・メモ・繰り返し・通知）。日時と同じく 2 つのフォームで共通 */
export function EventExtraFields({
  initial,
  errors,
  thisOnly,
}: Props & { /** この回だけの編集では繰り返しを変えられない */ thisOnly: boolean }) {
  return (
    <>
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
    </>
  );
}
