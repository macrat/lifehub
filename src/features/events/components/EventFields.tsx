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

/**
 * 終日の予定の通知の選択肢。終日には「n 分前」の瞬間が無いので、当日か前日の各自の通知時刻
 * （設定画面で選ぶ）に送る。サーバーは n 分を日に切り上げて前の日を決める（0 = 当日、1440 = 前日）。
 */
const ALL_DAY_REMIND_LABELS: Record<number, string> = {
  0: '当日',
  1440: '前日',
};
const ALL_DAY_REMIND_OPTIONS = [0, 1440] as const;

/** 時刻のある予定の選択肢を終日の選択肢に寄せる（0 分前は当日、それ以外は前日） */
function allDayRemind(minutes: number | null): number | null {
  if (minutes === null) return null;
  return minutes === 0 ? 0 : 1440;
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
export function EventExtraFields({
  initial,
  errors,
  allDay,
  thisOnly,
}: ScopedProps & { allDay: boolean }) {
  const options = allDay ? ALL_DAY_REMIND_OPTIONS : REMIND_BEFORE_OPTIONS;
  const labels = allDay ? ALL_DAY_REMIND_LABELS : REMIND_LABELS;
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
        // 終日を切り替えると選択肢が入れ替わるので、選択肢に合う値で作り直す
        key={allDay ? 'all-day' : 'timed'}
        name="remindStartMinutes"
        label="通知"
        select
        defaultValue={
          (allDay ? allDayRemind(initial.remindStartMinutes) : initial.remindStartMinutes) ??
          SELECT_NONE
        }
        fullWidth
      >
        <MenuItem value={SELECT_NONE}>通知しない</MenuItem>
        {options.map((m) => (
          <MenuItem key={m} value={m}>
            {labels[m]}
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
      <EventExtraFields initial={initial} errors={errors} allDay={allDay} thisOnly={thisOnly} />
    </>
  );
}

/**
 * タスクの全項目。予定と違って開始・期限はどちらも任意で、通知は「開始に」「期限に」の 2 択。
 * 終日なら開始日・期限日（日付だけ）になり、通知はその日の各自の通知時刻（設定画面で選ぶ）に届く。
 * 追加のフォーム（`TaskForm`）と詳細からの編集（`ItemDetailSheet`）で同じものを使う。
 *
 * autoFocus はタスクの追加だけ（`TaskForm`）。タスクはタイトルを打つだけで終わることが多いので、
 * 開いた所からそのまま打てるようにする。既にある記録を開くときは、シートが出た瞬間に
 * ソフトキーボードが立ち上がって中身を覆ってしまうので焦点は当てない。
 */
export function TaskFormFields({
  initial,
  errors,
  allDay,
  onChangeAllDay,
  thisOnly,
  autoFocus,
}: ScopedProps & {
  allDay: boolean;
  onChangeAllDay: (allDay: boolean) => void;
  autoFocus: boolean;
}) {
  const unit = allDay ? '日' : '日時';
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
      <FormControlLabel
        control={<Switch checked={allDay} onChange={(_, v) => onChangeAllDay(v)} />}
        label="終日"
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          // 終日の切り替えで日付だけ／日時に入れ替わるので、入力欄ごと作り直す
          key={`start-${allDay}`}
          name="startsAt"
          label={`開始${unit}`}
          type={allDay ? 'date' : 'datetime-local'}
          defaultValue={taskInputValue(initial.startsAt, 'start', initial.allDay, allDay)}
          error={Boolean(errors.startsAt)}
          helperText={errors.startsAt}
          slotProps={{ inputLabel: { shrink: true } }}
          fullWidth
        />
        <TextField
          key={`end-${allDay}`}
          name="endsAt"
          label={`期限${unit}`}
          type={allDay ? 'date' : 'datetime-local'}
          defaultValue={taskInputValue(initial.endsAt, 'end', initial.allDay, allDay)}
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
          label={`開始${unit}に通知`}
        />
        <FormControlLabel
          control={
            <Checkbox name="notifyAtEnd" defaultChecked={initial.remindEndMinutes !== null} />
          }
          label={`期限${unit}に通知`}
        />
      </Stack>
    </>
  );
}

/**
 * タスクの開始・期限の入力欄の初期値。未設定は空欄。
 * 保存されている終日の期限は排他的（翌日 0:00）なので、日付の欄には含む期限日を出す。
 */
function taskInputValue(
  value: string | null,
  edge: 'start' | 'end',
  savedAllDay: boolean,
  allDay: boolean,
): string {
  if (!value) return '';
  if (!allDay) return toDateTimeLocalValue(value);
  return edge === 'end' && savedAllDay ? inclusiveEndDate(value) : toDateString(new Date(value));
}
