import { TZDate } from '@date-fns/tz';
import { format, getDay } from 'date-fns';
import { TIME_ZONE } from '../../shared/constants.ts';
import { addDays, startOfDate, toDateString, today } from '../../shared/date.ts';
import type { DateString } from '../../shared/types.ts';

export { addDays, toDateString, today } from '../../shared/date.ts';

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

/** 予定の期間表示。終日は日付のみ、同日は "9/20(日) 09:00〜10:00"、複数日は両端を日時で。 */
export function formatEventRange(startsAt: string, endsAt: string, allDay: boolean): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (allDay) {
    const firstDay = toDateString(start);
    const lastDay = toDateString(new Date(end.getTime() - 1));
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

/** `<input type="datetime-local">` の値（JST として解釈）→ ISO 日時 */
export function fromDateTimeLocalValue(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) throw new Error(`invalid datetime-local value: ${value}`);
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  return new Date(new TZDate(y, mo - 1, d, h, mi, TIME_ZONE).getTime()).toISOString();
}

/** JST の暦日 → ISO 日時（その日の 0:00 JST） */
export function fromDateValue(value: DateString): string {
  return startOfDate(value).toISOString();
}

/** JST の暦日＋その日の 0:00 からの分 → ISO 日時（JST に夏時間は無いので分を足すだけでよい） */
export function fromMinutesOfDay(date: DateString, minutes: number): string {
  return new Date(startOfDate(date).getTime() + minutes * 60_000).toISOString();
}

/** 0:00 からの分 → "09:00"（24:00 はそのまま出す。時間帯の終わりの表示に使う） */
export function formatMinutesOfDay(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** 排他的な終了日時 → 含む終了日（終日の予定のフォーム用） */
export function inclusiveEndDate(endsAt: string): DateString {
  return toDateString(new Date(new Date(endsAt).getTime() - 1));
}

/** "YYYY-MM" */
export function toMonthString(date: DateString): string {
  return date.slice(0, 7);
}

/** 年月（YYYY-MM）の 1 日 */
export function firstDayOfMonth(month: string): DateString {
  return toDateString(startOfDate(`${month}-01` as DateString));
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

/** 瞬間 → JST のその日の 0:00 からの分 */
export function minutesOfDay(value: Date | string): number {
  const z = new TZDate(toDate(value), TIME_ZONE);
  return z.getHours() * 60 + z.getMinutes();
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

/** 日付（YYYY-MM-DD）が今日か。比較するだけなので DateString の印は要らない */
export function isToday(date: string): boolean {
  return date === today();
}

function toDate(value: Date | string): Date {
  if (value instanceof Date) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return startOfDate(value as DateString);
  return new Date(value);
}
