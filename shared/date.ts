import { TZDate } from '@date-fns/tz';
import { addDays as addDaysFn, differenceInCalendarDays, format } from 'date-fns';
import { TIME_ZONE } from './constants.ts';
import type { DateString } from './types.ts';

/**
 * Asia/Tokyo 固定の日付ユーティリティ。
 * 「日付（YYYY-MM-DD）」はすべて JST の暦日を指し、瞬間（Date / ISO 8601）との変換はここを通す。
 */

/** 瞬間 → JST の暦日 */
export function toDateString(date: Date): DateString {
  return format(new TZDate(date, TIME_ZONE), 'yyyy-MM-dd') as DateString;
}

/** JST の暦日 → その日の 0:00 JST の瞬間 */
export function startOfDate(date: DateString): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(new TZDate(y, m - 1, d, TIME_ZONE).getTime());
}

/** JST の暦日 + n 日 */
export function addDays(date: DateString, days: number): DateString {
  return toDateString(addDaysFn(new TZDate(startOfDate(date), TIME_ZONE), days));
}

/** 2 つの JST 暦日の差（b - a、日数） */
export function diffDays(a: DateString, b: DateString): number {
  return differenceInCalendarDays(
    new TZDate(startOfDate(b), TIME_ZONE),
    new TZDate(startOfDate(a), TIME_ZONE),
  );
}

/** 今日（JST） */
export function today(now: Date = new Date()): DateString {
  return toDateString(now);
}

/** JST の暦日＋その日の 0:00 からの分 → ISO 日時（JST に夏時間は無いので分を足すだけでよい） */
export function fromMinutesOfDay(date: DateString, minutes: number): string {
  return new Date(startOfDate(date).getTime() + minutes * 60_000).toISOString();
}

/** 排他的な終了日時（終日の項目の保存形式。翌日 0:00）→ 含む終了日 */
export function inclusiveEndDate(endsAt: string): DateString {
  return toDateString(new Date(new Date(endsAt).getTime() - 1));
}

/**
 * 終日の項目の開始日／終了日（期限日）。保存形式は開始が JST 0:00、終了が排他的（最終日の翌日 0:00）なので、
 * 終了は含む最終日にする。サーバー（通知）とクライアント（表示・フォーム）が同じ規則で読むよう 1 か所に置く。
 */
export function allDayDate(iso: string, edge: 'start' | 'end'): DateString {
  return edge === 'start' ? toDateString(new Date(iso)) : inclusiveEndDate(iso);
}

/** JST の 0:00 に切り捨てた瞬間 */
export function startOfDay(date: Date): Date {
  return startOfDate(toDateString(date));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateString(value: string): value is DateString {
  return DATE_RE.test(value) && !Number.isNaN(startOfDate(value as DateString).getTime());
}
