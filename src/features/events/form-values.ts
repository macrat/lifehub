import { addDays, isDateString } from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';
import {
  fromDateTimeLocalValue,
  fromDateValue,
  fromMinutesOfDay,
  minutesOfDay,
  toDateString,
} from '../../lib/date.ts';
import { formList, formSelect, formText } from '../../lib/form.ts';

/** 予定・タスクのフォームが扱う値（日時は ISO 文字列）。カレンダーの項目や保存されている行をそのまま渡せる */
export type ItemFormValues = {
  title: string;
  allDay: boolean;
  startsAt: string | null;
  /** 予定では終了（排他的）、タスクでは期限 */
  endsAt: string | null;
  /** 空なら全員（新規作成の既定） */
  participantIds: string[];
  location: string | null;
  note: string | null;
  rrule: string | null;
  remindStartMinutes: number | null;
  remindEndMinutes: number | null;
};

const EMPTY: ItemFormValues = {
  title: '',
  allDay: false,
  startsAt: null,
  endsAt: null,
  participantIds: [],
  location: null,
  note: null,
  rrule: null,
  remindStartMinutes: null,
  remindEndMinutes: null,
};

/** 指定日の時間帯（0:00 からの分）の予定の既定値。タイムラインのドラッグで選んだ時間帯をそのまま渡す */
export function eventValuesForRange(
  date: DateString,
  startMin: number,
  endMin: number,
): ItemFormValues {
  return {
    ...EMPTY,
    startsAt: fromMinutesOfDay(date, startMin),
    endsAt: fromMinutesOfDay(date, endMin),
  };
}

/**
 * 指定した日（両端を含む）の終日の予定の既定値。月表示・終日欄で選んだ期間をそのまま渡す。
 * 終了は保存されている予定と同じ「排他的な終わり」（翌日 0:00）で持つ。
 */
export function allDayEventValues(from: DateString, to: DateString): ItemFormValues {
  return {
    ...EMPTY,
    allDay: true,
    startsAt: fromDateValue(from),
    endsAt: fromDateValue(addDays(to, 1)),
  };
}

/**
 * 予定の既定値: 現在時刻の分を切り上げた正時から 1 時間。日の指定があればその日の同じ時刻。
 * 予定はこれから始まるものを入れることがほとんどなので、直近の正時をそのまま出して分の入力を省く。
 */
export function defaultEventValues(date?: DateString): ItemFormValues {
  const start = ceilToHour(new Date());
  const startMin = minutesOfDay(start);
  return eventValuesForRange(date ?? toDateString(start), startMin, startMin + 60);
}

/**
 * タスクの既定値: 日時なし。開始日時の無い未完了タスクは今日の位置に出るので、
 * 「いつかやる」を入れるときは日時に触らずに済む（予定と違って時間の枠を持たない）。
 */
export function defaultTaskValues(): ItemFormValues {
  return EMPTY;
}

/** 分を切り上げた正時（ちょうど正時ならそのまま）。JST は UTC+9 固定なのでエポックで丸めればよい */
function ceilToHour(value: Date): Date {
  const hour = 60 * 60 * 1000;
  return new Date(Math.ceil(value.getTime() / hour) * hour);
}

/**
 * 予定のフォームの入力 → 検証前の値（`createEventSchema` に渡す形）。
 * 全項目のフォームと、スマホのクイック入力（同じ項目を段で出し分ける）で同じ組み立てを使う。
 * 日時の入力欄が無いとき（PC のクイック入力の吹き出し）は fallback の日時をそのまま使う。
 */
export function eventInputFromForm(
  formData: FormData,
  {
    initial,
    allDay,
    thisOnly = false,
    fallback,
  }: {
    initial: ItemFormValues;
    allDay: boolean;
    thisOnly?: boolean;
    fallback?: { allDay: boolean; startsAt: string; endsAt: string };
  },
) {
  const startsRaw = formText(formData, 'startsAt');
  const endsRaw = formText(formData, 'endsAt');
  const toInstant = (raw: string) =>
    allDay && isDateString(raw) ? fromDateValue(raw) : fromDateTimeLocalValue(raw);
  const when =
    startsRaw && endsRaw
      ? { allDay, startsAt: toInstant(startsRaw), endsAt: toInstant(endsRaw) }
      : (fallback ?? { allDay, startsAt: initial.startsAt, endsAt: initial.endsAt });
  return {
    kind: 'event' as const,
    ...when,
    title: formText(formData, 'title') ?? '',
    participantIds: formList(formData, 'participantIds'),
    location: formText(formData, 'location'),
    note: formText(formData, 'note'),
    rrule: thisOnly ? initial.rrule : formText(formData, 'rrule'),
    remindStartMinutes:
      formSelect(formData, 'remindStartMinutes') === null
        ? null
        : Number(formText(formData, 'remindStartMinutes')),
    remindEndMinutes: initial.remindEndMinutes,
  };
}

/**
 * タスクのフォームの入力 → 検証前の値（`createEventSchema` に渡す形）。
 * 予定と違って開始・期限はどちらも任意で、通知は「その日時に」（= 0 分前）の 2 択。
 */
export function taskInputFromForm(
  formData: FormData,
  { initial, thisOnly = false }: { initial: ItemFormValues; thisOnly?: boolean },
) {
  const startsRaw = formText(formData, 'startsAt');
  const endsRaw = formText(formData, 'endsAt');
  return {
    kind: 'task' as const,
    title: formText(formData, 'title') ?? '',
    allDay: initial.allDay,
    startsAt: startsRaw ? fromDateTimeLocalValue(startsRaw) : null,
    endsAt: endsRaw ? fromDateTimeLocalValue(endsRaw) : null,
    participantIds: formList(formData, 'participantIds'),
    location: formText(formData, 'location'),
    note: formText(formData, 'note'),
    rrule: thisOnly ? initial.rrule : formText(formData, 'rrule'),
    remindStartMinutes: formData.get('notifyAtStart') === 'on' ? 0 : null,
    remindEndMinutes: formData.get('notifyAtEnd') === 'on' ? 0 : null,
  };
}
