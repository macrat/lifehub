import { TZDate } from '@date-fns/tz';
import { format, getDay, startOfMonth, subDays } from 'date-fns';
import { TIME_ZONE } from '../../shared/constants.ts';
import { addDays, startOfDate, toDateString, today } from '../../shared/date.ts';
import type { DateString } from '../../shared/types.ts';

export { addDays, diffDays, toDateString, today } from '../../shared/date.ts';

/**
 * 表示用の日付・時刻フォーマット。すべて JST。表示は Intl に任せ、計算は date-fns（TZDate）に任せる。
 */
const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: TIME_ZONE,
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
});
const dateWithYearFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
});
const timeFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const monthFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: 'long',
});

/** "9/20(日)" */
export function formatDate(value: Date | string | DateString): string {
  return dateFormatter.format(toDate(value));
}

/** "2026/9/20(日)" */
export function formatDateWithYear(value: Date | string | DateString): string {
  return dateWithYearFormatter.format(toDate(value));
}

/** "09:00" */
export function formatTime(value: Date | string): string {
  return timeFormatter.format(toDate(value));
}

/** "2026年9月" */
export function formatMonth(date: DateString): string {
  return monthFormatter.format(startOfDate(date));
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

/** 排他的な終了日時 → 含む終了日（終日の予定のフォーム用） */
export function inclusiveEndDate(endsAt: string): DateString {
  return toDateString(new Date(new Date(endsAt).getTime() - 1));
}

/** "YYYY-MM" */
export function toMonthString(date: DateString): string {
  return date.slice(0, 7);
}

/** 月表示のグリッド（月曜始まり、6 週 = 42 日）。先頭はその月の 1 日を含む週の月曜。 */
export function monthGridDays(month: string): DateString[] {
  const first = startOfMonth(new TZDate(startOfDate(`${month}-01` as DateString), TIME_ZONE));
  const offset = (getDay(first) + 6) % 7; // 月曜 = 0
  const start = toDateString(subDays(first, offset));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/** その日を含む週（月曜始まり）の 7 日 */
export function weekDays(date: DateString): DateString[] {
  const offset = (getDay(new TZDate(startOfDate(date), TIME_ZONE)) + 6) % 7;
  const start = addDays(date, -offset);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** 月を n か月ずらす */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export const WEEKDAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'] as const;

export function isToday(date: DateString): boolean {
  return date === today();
}

function toDate(value: Date | string): Date {
  if (value instanceof Date) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return startOfDate(value as DateString);
  return new Date(value);
}
