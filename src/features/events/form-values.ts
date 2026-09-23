import type { EventMaster } from '../../../shared/calendar.ts';
import { addDays, fromMinutesOfDay, isDateString } from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';
import { toAllDayRemind } from '../../../shared/validation/events.ts';
import { fromDateTimeLocalValue, fromDateValue } from '../../lib/date.ts';
import { formList, formSelect, formText } from '../../lib/form.ts';

/**
 * 予定・タスクのフォームが扱う値（日時は ISO 文字列）。保存されている行（`EventMaster`）の入力できる項目なので、
 * カレンダーの項目や保存されている行をそのまま渡せる。endsAt は予定では終了（排他的）、タスクでは期限。
 * participantIds は 1 人以上（空は検証で弾かれる。新規作成の既定は `defaultParticipants`）。
 */
export type ItemFormValues = Omit<EventMaster, 'id' | 'kind' | 'completedAt'>;

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

/**
 * 新規作成の既定の参加者: 自分だけ。相手の予定を勝手に増やさないよう、
 * 一緒に入れたいときだけ参加者を足してもらう。ログイン中のユーザーがまだ読めていなければ空
 * （検証の「1 人以上」で止まるので、誰にも紐づかない予定は保存されない）。
 */
export function defaultParticipants(meId: string | null): string[] {
  return meId === null ? [] : [meId];
}

/** 指定日の時間帯（0:00 からの分）の予定の既定値。タイムラインのドラッグで選んだ時間帯をそのまま渡す */
export function eventValuesForRange(
  date: DateString,
  startMin: number,
  endMin: number,
  participantIds: string[],
): ItemFormValues {
  return {
    ...EMPTY,
    participantIds,
    startsAt: fromMinutesOfDay(date, startMin),
    endsAt: fromMinutesOfDay(date, endMin),
  };
}

/**
 * 指定した日（両端を含む）の終日の予定の既定値。月表示・終日欄で選んだ期間をそのまま渡す。
 * 終了は保存されている予定と同じ「排他的な終わり」（翌日 0:00）で持つ。
 */
export function allDayEventValues(
  from: DateString,
  to: DateString,
  participantIds: string[],
): ItemFormValues {
  return {
    ...EMPTY,
    participantIds,
    allDay: true,
    startsAt: fromDateValue(from),
    endsAt: fromDateValue(addDays(to, 1)),
  };
}

/**
 * タスクの既定値: 日時なし。開始日時の無い未完了タスクは今日の位置に出るので、
 * 「いつかやる」を入れるときは日時に触らずに済む（予定と違って時間の枠を持たない）。
 */
export function defaultTaskValues(participantIds: string[]): ItemFormValues {
  return { ...EMPTY, participantIds };
}

/** 入力欄を通さずに渡す予定の日時（ISO）。終日の終わりは「含む日」のどこか（サーバーが翌日 0:00 に直す） */
export type FormInstants = { allDay: boolean; startsAt: string; endsAt: string };

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
    fallback?: FormInstants | undefined;
  },
) {
  const startsRaw = formText(formData, 'startsAt');
  const endsRaw = formText(formData, 'endsAt');
  const when =
    startsRaw && endsRaw
      ? { allDay, startsAt: toInstant(startsRaw, allDay), endsAt: toInstant(endsRaw, allDay) }
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
    // フォームに出していない終了前の通知（MCP から入れたもの）も、終日にしたら日単位に寄せる
    remindEndMinutes: allDay ? toAllDayRemind(initial.remindEndMinutes) : initial.remindEndMinutes,
  };
}

/**
 * タスクのフォームの入力 → 検証前の値（`createEventSchema` に渡す形）。
 * 予定と違って開始・期限はどちらも任意で、通知は「その日時に」（= 0 分前）の 2 択。
 * 終日では開始日・期限日（日付だけ）を受け取り、通知はその日の各自の通知時刻になる。
 */
export function taskInputFromForm(
  formData: FormData,
  {
    initial,
    allDay,
    thisOnly = false,
  }: { initial: ItemFormValues; allDay: boolean; thisOnly?: boolean },
) {
  return {
    kind: 'task' as const,
    title: formText(formData, 'title') ?? '',
    allDay,
    startsAt: optionalInstant(formText(formData, 'startsAt'), allDay),
    endsAt: optionalInstant(formText(formData, 'endsAt'), allDay),
    participantIds: formList(formData, 'participantIds'),
    location: formText(formData, 'location'),
    note: formText(formData, 'note'),
    rrule: thisOnly ? initial.rrule : formText(formData, 'rrule'),
    remindStartMinutes: formData.get('notifyAtStart') === 'on' ? 0 : null,
    remindEndMinutes: formData.get('notifyAtEnd') === 'on' ? 0 : null,
  };
}

/** 日時の入力欄の値 → ISO 日時。終日では日付だけの欄（`type="date"`）から来る */
function toInstant(raw: string, allDay: boolean): string {
  return allDay && isDateString(raw) ? fromDateValue(raw) : fromDateTimeLocalValue(raw);
}

/** 任意の日時の入力欄（タスクの開始・期限）。空欄は未設定 */
function optionalInstant(raw: string | null, allDay: boolean): string | null {
  return raw ? toInstant(raw, allDay) : null;
}
