import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import { allDayDate } from '../../../../shared/date.ts';
import {
  ALL_DAY_REMIND_OPTIONS,
  type AllDayRemind,
  REMIND_BEFORE_OPTIONS,
  type RecurrenceScope,
  toAllDayRemind,
} from '../../../../shared/validation/events.ts';
import { toDateString, toDateTimeLocalValue } from '../../../lib/date.ts';
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

/** 終日の予定の通知の選択肢（`ALL_DAY_REMIND_OPTIONS`）。当日か前日の、各自の通知時刻（設定画面で選ぶ）に届く */
const ALL_DAY_REMIND_LABELS: Record<AllDayRemind, string> = {
  0: '当日',
  1440: '前日',
};

const REMIND_LABELS: Record<(typeof REMIND_BEFORE_OPTIONS)[number], string> = {
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
        <WhenField
          name="startsAt"
          label={allDay ? '開始日' : '開始'}
          defaultValue={inputValue(start, 'start', initial.allDay, allDay)}
          allDay={allDay}
          error={errors.startsAt}
        />
        <WhenField
          name="endsAt"
          label={allDay ? '終了日' : '終了'}
          defaultValue={inputValue(end, 'end', initial.allDay, allDay)}
          allDay={allDay}
          error={errors.endsAt}
        />
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
  const options = allDay
    ? ALL_DAY_REMIND_OPTIONS.map((m) => ({ value: m, label: ALL_DAY_REMIND_LABELS[m] }))
    : REMIND_BEFORE_OPTIONS.map((m) => ({ value: m, label: REMIND_LABELS[m] }));
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
          (allDay ? toAllDayRemind(initial.remindStartMinutes) : initial.remindStartMinutes) ??
          SELECT_NONE
        }
        fullWidth
      >
        <MenuItem value={SELECT_NONE}>通知しない</MenuItem>
        {options.map(({ value, label }) => (
          <MenuItem key={value} value={value}>
            {label}
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
        <WhenField
          name="startsAt"
          label={`開始${unit}`}
          defaultValue={inputValue(initial.startsAt, 'start', initial.allDay, allDay)}
          allDay={allDay}
          error={errors.startsAt}
        />
        <WhenField
          name="endsAt"
          label={`期限${unit}`}
          defaultValue={inputValue(initial.endsAt, 'end', initial.allDay, allDay)}
          allDay={allDay}
          error={errors.endsAt}
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
 * 日時の入力欄 1 つ。終日なら日付だけ（`type="date"`）、そうでなければ日時。予定とタスクで同じものを使う。
 * 終日の切り替えで種類が入れ替わるので、key に含めて入力欄ごと作り直す（残っている値を別の形式で読ませない）。
 */
function WhenField({
  name,
  label,
  defaultValue,
  allDay,
  error,
}: {
  name: 'startsAt' | 'endsAt';
  label: string;
  defaultValue: string;
  allDay: boolean;
  error: string | undefined;
}) {
  return (
    <TextField
      key={`${name}-${allDay}`}
      name={name}
      label={label}
      type={allDay ? 'date' : 'datetime-local'}
      defaultValue={defaultValue}
      error={Boolean(error)}
      helperText={error}
      slotProps={{ inputLabel: { shrink: true } }}
      fullWidth
    />
  );
}

/**
 * 日時の入力欄の初期値。未設定は空欄。
 * 保存されている値が終日なら、その保存形式どおりに日付へ直す（終了は排他的なので含む最終日。`allDayDate`）。
 */
function inputValue(
  value: string | null,
  edge: 'start' | 'end',
  savedAllDay: boolean,
  allDay: boolean,
): string {
  if (!value) return '';
  if (!allDay) return toDateTimeLocalValue(value);
  return savedAllDay ? allDayDate(value, edge) : toDateString(new Date(value));
}
