import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import type { ChangeEvent } from 'react';
import { EDGE_LABELS } from '../../../../shared/calendar.ts';
import { allDayDate, toDateString } from '../../../../shared/date.ts';
import {
  ALL_DAY_REMIND_OPTIONS,
  type AllDayRemind,
  type EventKind,
  REMIND_BEFORE_OPTIONS,
  type RecurrenceScope,
  toAllDayRemind,
} from '../../../../shared/validation/events.ts';
import { toDateTimeLocalValue } from '../../../lib/date.ts';
import { type FormErrors, SELECT_NONE } from '../../../lib/form.ts';
import { ParticipantsField } from '../../users/components/ParticipantsField.tsx';
import {
  EXTRA_FIELDS_MARKER,
  endFollowsStart,
  type ItemFormValues,
  splitWhen,
  whenFieldNames,
} from '../form-values.ts';
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

/** 終日の通知の選択肢（`ALL_DAY_REMIND_OPTIONS`）。当日か前日の、各自の通知時刻（設定画面で選ぶ）に届く */
const ALL_DAY_REMIND_LABELS: Record<AllDayRemind, string> = {
  0: '当日',
  1440: '前日',
};

/** 時刻のある通知の選択肢。0 分前は「開始時刻」のように、その端の時刻そのもの */
const REMIND_LABELS: Record<Exclude<(typeof REMIND_BEFORE_OPTIONS)[number], 0>, string> = {
  5: '5分前',
  10: '10分前',
  15: '15分前',
  30: '30分前',
  60: '1時間前',
  120: '2時間前',
  1440: '1日前',
};

type AllDayProps = { allDay: boolean; onChangeAllDay: (allDay: boolean) => void };

/**
 * 予定・タスクの全項目（タイトル・日時・参加者・場所・メモ・繰り返し・通知）。
 * 全項目のフォーム（`ItemForm`）と詳細からの編集（`ItemDetailSheet`）で同じものを使う。
 * 予定とタスクで違うのは日時（`WhenFields`）だけ。
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
}: ScopedProps & AllDayProps & { kind: EventKind; autoFocus?: boolean }) {
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
        // 種類を切り替えたら、切り替えた既定値（`switchKindValues`）の日時で入力欄を作り直す
        key={kind}
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
      <ExtraFields initial={initial} errors={errors} allDay={allDay} thisOnly={thisOnly} />
    </>
  );
}

/**
 * 日時（終日の切り替えと、予定なら開始・終了、タスクなら開始だけ）。全項目（`ItemFields`）と、
 * スマホで上の段まで広げたクイック入力（`QuickItemForm`）で同じものを使う。
 * 開始・終了はそれぞれ日付と時刻の 2 つの欄に分け（`whenFieldNames`）、日付を左、時刻を右の列に並べる。
 * 終日の切り替えは時刻の列の上に置き、時刻の欄と縦の線を揃える。終日では時刻の欄を出さず、日付の欄を行いっぱいに広げる。
 * 終日かどうかは状態として呼び出し側から受け取る。
 * 開始はどちらも必須。予定は終了も必須で、開始を動かすと終了も長さを保ったまま動く（`endFollowsStart`）。
 */
export function WhenFields({
  kind,
  initial,
  errors,
  allDay,
  onChangeAllDay,
}: Props & AllDayProps & { kind: EventKind }) {
  const isEvent = kind === 'event';
  return (
    <Box
      sx={{
        display: 'grid',
        // 日付は年月日と曜日のピッカーの印が入る分だけ時刻より広く取る
        gridTemplateColumns: '3fr 2fr',
        columnGap: 2,
        rowGap: 2,
        alignItems: 'start',
      }}
    >
      <FormControlLabel
        control={<Switch checked={allDay} onChange={(_, v) => onChangeAllDay(v)} />}
        label="終日"
        sx={{ gridColumn: 2 }}
      />
      <WhenField
        name="startsAt"
        edge={EDGE_LABELS.start}
        defaultValue={inputValue(initial.startsAt, 'start', initial.allDay, allDay)}
        allDay={allDay}
        error={errors.startsAt}
        onChange={isEvent ? endFollowsStart : undefined}
      />
      {isEvent && (
        <WhenField
          name="endsAt"
          edge={EDGE_LABELS.end}
          // 予定の値は終了を必ず持つ（型はタスクと共通なので null を開始で埋める）
          defaultValue={inputValue(
            initial.endsAt ?? initial.startsAt,
            'end',
            initial.allDay,
            allDay,
          )}
          allDay={allDay}
          error={errors.endsAt}
        />
      )}
    </Box>
  );
}

/**
 * 残りの項目（場所・メモ・繰り返し・通知）。日時と同じく全項目とクイック入力で共通。
 * 通知は開始の何分前か（終日なら当日か前日）を 1 つ選ぶ（`RemindField`）。
 * WHY 予定とタスクで同じ欄にする: 種類を切り替えても開始前の通知をそのまま引き継げる。
 * 終日の予定・タスクの通知は、その日の各自の通知時刻（設定画面で選ぶ）に届く。
 */
export function ExtraFields({
  initial,
  errors,
  allDay,
  thisOnly,
}: ScopedProps & { allDay: boolean }) {
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
      <RemindField saved={initial.remindStartMinutes} allDay={allDay} />
    </>
  );
}

/**
 * 開始前の通知（開始の何分前か。終日なら当日か前日）。予定もタスクも同じ選び方で、
 * 同じ位置・同じ部品なので、種類を切り替えても選んだ値が残る。
 */
function RemindField({ saved, allDay }: { saved: number | null; allDay: boolean }) {
  const options = allDay
    ? ALL_DAY_REMIND_OPTIONS.map((m) => ({ value: m, label: ALL_DAY_REMIND_LABELS[m] }))
    : REMIND_BEFORE_OPTIONS.map((m) => ({
        value: m,
        label: m === 0 ? `${EDGE_LABELS.start}時刻` : REMIND_LABELS[m],
      }));
  return (
    <TextField
      // 終日を切り替えると選択肢が入れ替わるので、選択肢に合う値で作り直す
      key={allDay ? 'all-day' : 'timed'}
      name="remindStartMinutes"
      label="通知"
      select
      defaultValue={(allDay ? toAllDayRemind(saved) : saved) ?? SELECT_NONE}
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

/**
 * 日時の入力欄 1 組: 日付（左の列。終日では行いっぱい）と時刻（右の列。終日では出さない）。予定とタスクで同じものを使う。
 * 名前は「開始日」「開始時刻」のように端の名前（edge）から付ける。
 * 終日の切り替えで初期値の形が変わるので、key に含めて入力欄ごと作り直す（切り替え前の値を別の形で読ませない）。
 * 誤りは日付の欄の下に出し、時刻の欄も誤りの色にする。
 */
function WhenField({
  name,
  edge,
  defaultValue,
  allDay,
  error,
  onChange,
}: {
  name: 'startsAt' | 'endsAt';
  edge: string;
  /** "YYYY-MM-DD"（終日）か "YYYY-MM-DDTHH:mm"。未設定は空 */
  defaultValue: string;
  allDay: boolean;
  error: string | undefined;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const names = whenFieldNames(name);
  const { date, time } = splitWhen(defaultValue);
  return (
    <>
      <TextField
        key={`${names.date}-${allDay}`}
        name={names.date}
        label={`${edge}日`}
        type="date"
        defaultValue={date}
        onChange={onChange}
        error={Boolean(error)}
        helperText={error}
        slotProps={{ inputLabel: { shrink: true } }}
        // 終日では時刻の欄が無いので、日付の欄を行いっぱいに広げる
        sx={{ gridColumn: allDay ? '1 / -1' : 1 }}
        fullWidth
      />
      {!allDay && (
        <TextField
          name={names.time}
          label={`${edge}時刻`}
          type="time"
          defaultValue={time}
          onChange={onChange}
          error={Boolean(error)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ gridColumn: 2 }}
          fullWidth
        />
      )}
    </>
  );
}

/**
 * 日時の入力欄の初期値。
 * 保存されている値が終日なら、その保存形式どおりに日付へ直す（終了は排他的なので含む最終日。`allDayDate`）。
 */
function inputValue(
  value: string,
  edge: 'start' | 'end',
  savedAllDay: boolean,
  allDay: boolean,
): string {
  if (!allDay) return toDateTimeLocalValue(value);
  return savedAllDay ? allDayDate(value, edge) : toDateString(new Date(value));
}
