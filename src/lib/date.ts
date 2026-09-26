import { TZDate } from '@date-fns/tz';
import { format, getDay } from 'date-fns';
import { TIME_ZONE } from '../../shared/constants.ts';
import {
  addDays,
  allDayDate,
  isDateString,
  startOfDate,
  toDateString,
  today,
} from '../../shared/date.ts';
import type { DateString } from '../../shared/types.ts';

/**
 * クライアントだけが使う日付の表示・入力欄の変換・カレンダーの並び。
 * JST の暦日の計算（`shared/date.ts`）はここから再 export せず、使う側が shared から直接読む
 * （どちらから読むかが関数ごとに分かれないように。サーバーと共有する物は shared、それ以外はここ）。
 */

/**
 * 表示用の日付・時刻フォーマット。すべて JST。表示は Intl に任せ、計算は date-fns（TZDate）に任せる。
 * 年を含む表示は "2026年09月20日（日）"・"2026年09月" に揃える。AppBar の見出しのように
 * 日付だけが入れ替わる場所で、桁が揃っていると横幅が動かず読み取りやすいため。
 * ja-JP の既定は "2026/9/20(日)" で年月日の区切りも 2 桁揃えも出せないので、
 * 桁の揃っている DateString（"YYYY-MM-DD"）から組み立て、Intl には曜日だけを任せる。
 */
const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: TIME_ZONE,
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
});
const paddedDateFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: TIME_ZONE,
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
});
const timeFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const weekdayFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: TIME_ZONE,
  weekday: 'short',
});

/** "9/20(日)" */
export function formatDate(value: Date | string | DateString): string {
  return dateFormatter.format(toDate(value));
}

/**
 * "09/20(日)"。日付が縦に並ぶところ（レモンの記録の一覧）で使う。
 * 桁を揃えると日付の幅が行ごとに動かないので、続けて並べる列の左端が揃う。
 */
export function formatDatePadded(value: Date | string | DateString): string {
  return paddedDateFormatter.format(toDate(value));
}

/** "2026年09月20日（日）" */
export function formatDateWithYear(value: Date | string | DateString): string {
  const date = toDateString(toDate(value));
  return `${formatMonth(date)}${date.slice(8, 10)}日（${weekdayFormatter.format(startOfDate(date))}）`;
}

/** "09:00" */
export function formatTime(value: Date | string): string {
  return timeFormatter.format(toDate(value));
}

/** "2026年09月" */
export function formatMonth(date: DateString): string {
  return `${date.slice(0, 4)}年${date.slice(5, 7)}月`;
}

/** "9/20(日) 09:00" */
export function formatDateTime(value: Date | string): string {
  return `${formatDate(value)} ${formatTime(value)}`;
}

/**
 * タイムラインの日時。今日なら時刻だけ（日付だけの記録は「今日」）、今年なら "9/20(日) 09:00"、
 * 別の年なら年から "2025/9/20(土) 09:00"。行の右に添える薄い字なので、分かる範囲で短くする。
 */
export function formatTimelineTime(at: string, dateOnly: boolean, now: Date = new Date()): string {
  const date = toDateString(new Date(at));
  const todayDate = today(now);
  if (date === todayDate) return dateOnly ? '今日' : formatTime(at);
  const text = dateOnly ? formatDate(at) : formatDateTime(at);
  return date.slice(0, 4) === todayDate.slice(0, 4) ? text : `${date.slice(0, 4)}/${text}`;
}

/** タイムラインの終日の期間。1 日なら "今日" / "9/20(日)"、複数日なら "9/20(日)〜今日"（今日・年の扱いは `formatTimelineTime`） */
export function formatTimelineDays(
  first: DateString,
  last: DateString,
  now: Date = new Date(),
): string {
  const day = (date: DateString) => formatTimelineTime(startOfDate(date).toISOString(), true, now);
  return first === last ? day(first) : `${day(first)}〜${day(last)}`;
}

/** 開始・終了（期限）の 1 つの日時の表示。終日は日付だけ（終了は含む最終日） */
export function formatEdge(iso: string, edge: 'start' | 'end', allDay: boolean): string {
  return allDay ? formatDate(allDayDate(iso, edge)) : formatDateTime(iso);
}

/** 予定の期間表示。終日は日付のみ、同日は "9/20(日) 09:00〜10:00"、複数日は両端を日時で。 */
export function formatEventRange(startsAt: string, endsAt: string, allDay: boolean): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (allDay) {
    const firstDay = allDayDate(startsAt, 'start');
    const lastDay = allDayDate(endsAt, 'end');
    return firstDay === lastDay
      ? formatDate(firstDay)
      : `${formatDate(firstDay)}〜${formatDate(lastDay)}`;
  }
  if (toDateString(start) === toDateString(end)) {
    return `${formatDate(start)} ${formatTime(start)}〜${formatTime(end)}`;
  }
  return `${formatDateTime(start)}〜${formatDateTime(end)}`;
}

/** ISO 日時 → `<input type="datetime-local">` の値（JST） */
export function toDateTimeLocalValue(value: Date | string): string {
  return format(new TZDate(toDate(value), TIME_ZONE), "yyyy-MM-dd'T'HH:mm");
}

/** `<input type="datetime-local">` の値（"YYYY-MM-DDTHH:mm"）の形 */
const DATE_TIME_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/** `<input type="datetime-local">` の値として読めるか（書きかけの間は空になる） */
export function isDateTimeLocalValue(value: string): boolean {
  return DATE_TIME_LOCAL.test(value);
}

/** `<input type="datetime-local">` の値（JST として解釈）→ ISO 日時 */
export function fromDateTimeLocalValue(value: string): string {
  const m = DATE_TIME_LOCAL.exec(value);
  if (!m) throw new Error(`invalid datetime-local value: ${value}`);
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  return new Date(new TZDate(y, mo - 1, d, h, mi, TIME_ZONE).getTime()).toISOString();
}

/** JST の暦日 → ISO 日時（その日の 0:00 JST） */
export function fromDateValue(value: DateString): string {
  return startOfDate(value).toISOString();
}

/** 0:00 からの分 → "09:00"（24:00 はそのまま出す。時間帯の終わりの表示に使う） */
export function formatMinutesOfDay(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** "YYYY-MM" */
export function toMonthString(date: DateString): string {
  return date.slice(0, 7);
}

/** 年月（YYYY-MM）の 1 日 */
export function firstDayOfMonth(month: string): DateString {
  const date = `${month}-01`;
  if (!isDateString(date)) throw new Error(`invalid month: ${month}`);
  return date;
}

/** 年月（YYYY-MM）の全日を覆う範囲（両端含む） */
export function monthRange(month: string): { from: DateString; to: DateString } {
  return { from: firstDayOfMonth(month), to: addDays(firstDayOfMonth(addMonths(month, 1)), -1) };
}

/** [from, to]（両端含む）に掛かる年月（YYYY-MM）を昇順で */
export function monthsInRange(from: DateString, to: DateString): string[] {
  const months: string[] = [];
  for (let m = toMonthString(from); m <= toMonthString(to); m = addMonths(m, 1)) months.push(m);
  return months;
}

/** 月表示のグリッドの 6 週。各要素はその週の月曜で、先頭はその月の 1 日を含む週。 */
export function monthGridWeeks(month: string): DateString[] {
  const first = firstDayOfMonth(month);
  const start = addDays(first, -weekdayIndex(first));
  return Array.from({ length: 6 }, (_, i) => addDays(start, i * 7));
}

/** 月表示のグリッドの 42 日（月曜始まり、6 週） */
export function monthGridDays(month: string): DateString[] {
  return monthGridWeeks(month).flatMap(weekDays);
}

/** その日を含む週（月曜始まり）の 7 日 */
export function weekDays(date: DateString): DateString[] {
  const start = addDays(date, -weekdayIndex(date));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** 月を n か月ずらす */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/**
 * 週（月曜始まり）の見出し。"09月14日〜20日"、月をまたぐなら "08月31日〜09月06日"、
 * 始まりが今年でなければ年から書いて "2030年01月14日〜20日"。
 *
 * 週は必ず月曜から日曜なので曜日は書かず、終わりからは始まりと重なる年月を省く。
 * 始まりの年も、ほとんどの場合は今年を見ているので言わずに済む。
 * 両端を "2026年09月14日（月）〜2026年09月20日（日）" と書くと AppBar に収まらないため。
 */
export function formatWeekRange(monday: DateString): string {
  const sunday = addDays(monday, 6);
  const start =
    monday.slice(0, 4) === today().slice(0, 4)
      ? `${monday.slice(5, 7)}月${monday.slice(8, 10)}日`
      : `${formatMonth(monday)}${monday.slice(8, 10)}日`;
  const end =
    toMonthString(monday) === toMonthString(sunday)
      ? `${sunday.slice(8, 10)}日`
      : `${sunday.slice(5, 7)}月${sunday.slice(8, 10)}日`;
  return `${start}〜${end}`;
}

export const WEEKDAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'] as const;

/** 月曜 = 0 の曜日番号 */
export function weekdayIndex(date: DateString): number {
  return (getDay(new TZDate(startOfDate(date), TIME_ZONE)) + 6) % 7;
}

/** 曜日の文字色（土は青、日は赤）。MUI のパレット名で返す */
export function weekdayColor(index: number): string {
  return index === 5 ? 'info.main' : index === 6 ? 'error.main' : 'text.primary';
}

/** 曜日の見出し（月〜日の並び）の文字色。平日は日付より控えめにし、土日だけ曜日の色にする */
export function weekdayLabelColor(index: number): string {
  return index < 5 ? 'text.secondary' : weekdayColor(index);
}

/** 日付の文字色。曜日の色で、祝日は日曜と同じ赤 */
export function dateColor(date: DateString, holiday: boolean): string {
  return weekdayColor(holiday ? 6 : weekdayIndex(date));
}

/** 日付（JST の暦日）が今日か */
export function isToday(date: DateString): boolean {
  return date === today();
}

function toDate(value: Date | string): Date {
  if (value instanceof Date) return value;
  if (isDateString(value)) return startOfDate(value);
  return new Date(value);
}
