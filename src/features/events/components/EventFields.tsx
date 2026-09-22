import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import {
  REMIND_BEFORE_OPTIONS,
  type RecurrenceScope,
} from '../../../../shared/validation/events.ts';
import { inclusiveEndDate, toDateString, toDateTimeLocalValue } from '../../../lib/date.ts';
import { type FormErrors, SELECT_NONE } from '../../../lib/form.ts';
import { ParticipantsField } from '../../users/components/ParticipantsField.tsx';
import type { ItemFormValues } from '../form-values.ts';
import { RecurrenceFields } from './RecurrenceFields.tsx';

type Props = {
  initial: ItemFormValues;
  errors: FormErrors;
};

/** this のときは繰り返しの設定は変更できない（回の行は繰り返さない） */
type ScopedProps = Props & { thisOnly: boolean };

/** 繰り返しのどこを直しているかの表示。見出しには出ないので、入力欄の先頭で示す */
const SCOPE_LABELS: Record<RecurrenceScope, string> = {
  this: 'この回だけ編集',
  following: 'これ以降を編集',
  all: 'すべての回を編集',
};

/** 繰り返しのどの回を直しているかの印（詳細の編集とクイック入力で同じもの） */
export function ScopeChip({ scope }: { scope: RecurrenceScope }) {
  return (
    <Chip
      size="small"
      variant="outlined"
      label={SCOPE_LABELS[scope]}
      sx={{ alignSelf: 'flex-start' }}
    />
  );
}

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
export function EventExtraFields({ initial, errors, thisOnly }: ScopedProps) {
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

/**
 * 予定の全項目（タイトル・日時・参加者・場所・メモ・繰り返し・通知）。
 * 追加のフォーム（`EventForm`）と詳細からの編集（`ItemDetailSheet`）で同じものを使う。
 */
export function EventFormFields({
  initial,
  errors,
  allDay,
  onChangeAllDay,
  thisOnly,
}: ScopedProps & { allDay: boolean; onChangeAllDay: (allDay: boolean) => void }) {
  return (
    <>
      <TextField
        name="title"
        label="タイトル"
        defaultValue={initial.title}
        error={Boolean(errors.title)}
        helperText={errors.title}
        fullWidth
      />
      <EventWhenFields
        initial={initial}
        errors={errors}
        allDay={allDay}
        onChangeAllDay={onChangeAllDay}
      />
      <ParticipantsField
        name="participantIds"
        defaultValue={initial.participantIds}
        error={errors.participantIds}
      />
      <EventExtraFields initial={initial} errors={errors} thisOnly={thisOnly} />
    </>
  );
}

/**
 * タスクの全項目。予定と違って開始・期限はどちらも任意で、通知は「開始日時に」「期限日時に」の 2 択。
 * 追加のフォーム（`TaskForm`）と詳細からの編集（`ItemDetailSheet`）で同じものを使う。
 *
 * autoFocus はタスクの追加だけ（`TaskForm`）。タスクはタイトルを打つだけで終わることが多いので、
 * 開いた所からそのまま打てるようにする。既にある記録を開くときは、シートが出た瞬間に
 * ソフトキーボードが立ち上がって中身を覆ってしまうので焦点は当てない。
 */
export function TaskFormFields({
  initial,
  errors,
  thisOnly,
  autoFocus,
}: ScopedProps & { autoFocus: boolean }) {
  return (
    <>
      <TextField
        name="title"
        label="タイトル"
        defaultValue={initial.title}
        error={Boolean(errors.title)}
        helperText={errors.title}
        autoFocus={autoFocus}
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
    </>
  );
}
