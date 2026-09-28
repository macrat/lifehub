import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import type { ChangeEvent } from 'react';
import { TASK_TIME_LABELS } from '../../../../shared/calendar.ts';
import { allDayDate, toDateString } from '../../../../shared/date.ts';
import {
  ALL_DAY_REMIND_OPTIONS,
  type AllDayRemind,
  REMIND_BEFORE_OPTIONS,
  type RecurrenceScope,
  toAllDayRemind,
} from '../../../../shared/validation/events.ts';
import { toDateTimeLocalValue } from '../../../lib/date.ts';
import { type FormErrors, SELECT_NONE } from '../../../lib/form.ts';
import { ParticipantsField } from '../../users/components/ParticipantsField.tsx';
import { EXTRA_FIELDS_MARKER, endFollowsStart, type ItemFormValues } from '../form-values.ts';
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

type Kind = 'event' | 'task';

type AllDayProps = { allDay: boolean; onChangeAllDay: (allDay: boolean) => void };

/**
 * 予定・タスクの全項目（タイトル・日時・参加者・場所・メモ・繰り返し・通知）。
 * 全項目のフォーム（`ItemForm`）と詳細からの編集（`ItemDetailSheet`）で同じものを使う。
 * 予定とタスクで違うのは日時（`WhenFields`）と通知（`ExtraFields`）だけ。
 *
 * autoFocus はタスクの追加だけ（`ItemForm`）。追加なら次に打つのは必ずタイトルだと分かるので、
 * 開いた所からそのまま打てるようにする。既にある記録の編集では、項目が多くてどの項目を
 * 直すつもりで開いたのか分からないので焦点は当てない。
 */
export function ItemFields({
  kind,
  initial,
  errors,
  allDay,
  onChangeAllDay,
  thisOnly,
  autoFocus = false,
}: ScopedProps & AllDayProps & { kind: Kind; autoFocus?: boolean }) {
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
      <WhenFields
        kind={kind}
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
      <ExtraFields
        kind={kind}
        initial={initial}
        errors={errors}
        allDay={allDay}
        thisOnly={thisOnly}
      />
    </>
  );
}

/**
 * 日時（終日の切り替えと、開始・終了または開始・期限）。全項目（`ItemFields`）と、
 * スマホで上の段まで広げたクイック入力（`QuickItemForm`）で同じものを使う。
 * 終日かどうかで日付だけ／日時に入れ替わるので、その状態だけ呼び出し側から受け取る。
 * 予定は開始・終了が必須で、開始を動かすと終了も長さを保ったまま動く（`endFollowsStart`）。
 * タスクは開始・期限がどちらも任意なので、空のまま出す。
 */
export function WhenFields({
  kind,
  initial,
  errors,
  allDay,
  onChangeAllDay,
}: Props & AllDayProps & { kind: Kind }) {
  const when = kind === 'event' ? eventWhen(initial, allDay) : taskWhen(initial, allDay);
  return (
    <>
      <FormControlLabel
        control={<Switch checked={allDay} onChange={(_, v) => onChangeAllDay(v)} />}
        label="終日"
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <WhenField
          name="startsAt"
          label={when.startLabel}
          defaultValue={inputValue(when.start, 'start', initial.allDay, allDay)}
          allDay={allDay}
          error={errors.startsAt}
          onChange={kind === 'event' ? endFollowsStart : undefined}
        />
        <WhenField
          name="endsAt"
          label={when.endLabel}
          defaultValue={inputValue(when.end, 'end', initial.allDay, allDay)}
          allDay={allDay}
          error={errors.endsAt}
        />
      </Stack>
    </>
  );
}

/** 予定の日時の入力欄。開始が無ければ今、終了が無ければ開始から始める */
function eventWhen(initial: ItemFormValues, allDay: boolean) {
  const start = initial.startsAt ?? new Date().toISOString();
  return {
    start,
    end: initial.endsAt ?? start,
    startLabel: allDay ? '開始日' : '開始',
    endLabel: allDay ? '終了日' : '終了',
  };
}

/** タスクの日時の入力欄 */
function taskWhen(initial: ItemFormValues, allDay: boolean) {
  const label = taskWhenLabels(allDay);
  return {
    start: initial.startsAt,
    end: initial.endsAt,
    startLabel: label.start,
    endLabel: label.due,
  };
}

/**
 * 残りの項目（場所・メモ・繰り返し・通知）。日時と同じく全項目とクイック入力で共通。
 * 通知は、予定は開始の何分前か（終日なら当日か前日）の 1 つ、タスクは「開始に」「期限に」の 2 択。
 * 終日の予定・タスクの通知は、その日の各自の通知時刻（設定画面で選ぶ）に届く。
 */
export function ExtraFields({
  kind,
  initial,
  errors,
  allDay,
  thisOnly,
}: ScopedProps & { kind: Kind; allDay: boolean }) {
  return (
    <>
      <input type="hidden" name={EXTRA_FIELDS_MARKER} value="1" />
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
      {kind === 'event' ? (
        <EventRemindField initial={initial} allDay={allDay} />
      ) : (
        <TaskRemindFields initial={initial} allDay={allDay} />
      )}
    </>
  );
}

/** 予定の通知。開始の何分前か（終日なら当日か前日） */
function EventRemindField({ initial, allDay }: { initial: ItemFormValues; allDay: boolean }) {
  const options = allDay
    ? ALL_DAY_REMIND_OPTIONS.map((m) => ({ value: m, label: ALL_DAY_REMIND_LABELS[m] }))
    : REMIND_BEFORE_OPTIONS.map((m) => ({ value: m, label: REMIND_LABELS[m] }));
  return (
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
  );
}

/** タスクの通知。開始に・期限に通知するかの 2 つ */
function TaskRemindFields({ initial, allDay }: { initial: ItemFormValues; allDay: boolean }) {
  const label = taskWhenLabels(allDay);
  return (
    <Stack direction="row" spacing={2}>
      <FormControlLabel
        control={
          <Checkbox name="notifyAtStart" defaultChecked={initial.remindStartMinutes !== null} />
        }
        label={`${label.start}に通知`}
      />
      <FormControlLabel
        control={<Checkbox name="notifyAtEnd" defaultChecked={initial.remindEndMinutes !== null} />}
        label={`${label.due}に通知`}
      />
    </Stack>
  );
}

/** タスクの開始・期限の入力欄の名前。終日なら日付だけ（開始日）、そうでなければ日時（開始日時） */
function taskWhenLabels(allDay: boolean) {
  const unit = allDay ? '日' : '日時';
  return { start: `${TASK_TIME_LABELS.start}${unit}`, due: `${TASK_TIME_LABELS.due}${unit}` };
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
  onChange,
}: {
  name: 'startsAt' | 'endsAt';
  label: string;
  defaultValue: string;
  allDay: boolean;
  error: string | undefined;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <TextField
      key={`${name}-${allDay}`}
      name={name}
      label={label}
      type={allDay ? 'date' : 'datetime-local'}
      defaultValue={defaultValue}
      onChange={onChange}
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
