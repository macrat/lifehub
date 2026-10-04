import { TZDate } from '@date-fns/tz';
import { addDays as addDaysFn, differenceInCalendarDays, format } from 'date-fns';
import { TIME_ZONE } from './constants.ts';
import type { DateString } from './types.ts';

/**
 * Asia/Tokyo 固定の日付ユーティリティ。
 * 「日付（YYYY-MM-DD）」はすべて JST の暦日を指し、瞬間（Date / ISO 8601）との変換はここを通す。
 */

/** 両端を含む JST 暦日の期間 */
export type DateRange = { from: DateString; to: DateString };

/** 瞬間の期間 [from, to)（to は含まない） */
export type InstantRange = { from: Date; to: Date };

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

/** 瞬間（Date / ISO 日時）→ JST のその日の 0:00 からの分 */
export function minutesOfDay(value: Date | string): number {
  const z = new TZDate(new Date(value), TIME_ZONE);
  return z.getHours() * 60 + z.getMinutes();
}

/** JST の暦日＋その日の 0:00 からの分 → ISO 日時（JST に夏時間は無いので分を足すだけでよい） */
export function fromMinutesOfDay(date: DateString, minutes: number): string {
  return new Date(startOfDate(date).getTime() + minutes * 60_000).toISOString();
}

/**
 * 両端を含む JST 暦日の期間 → 瞬間の期間（from の 0:00 から、to の翌日 0:00 の手前まで。to は排他的）。
 * 日付で指定された期間を、日時の列（timestamptz）で絞るときに使う。
 */
export function instantRange(range: DateRange): InstantRange {
  return { from: startOfDate(range.from), to: startOfDate(addDays(range.to, 1)) };
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

/**
 * 実在する暦日の YYYY-MM-DD か。形だけでなく、日付として読み直して同じ文字列に戻ることまで確かめる。
 * WHY: 日付の組み立て（TZDate / Date）は範囲外の月日を繰り上げるので（2 月 31 日 → 3 月 3 日）、
 * 読めたかどうかだけでは存在しない日付が通り、DB の date 型で拒否されて 500 になる。
 */
export function isDateString(value: string): value is DateString {
  if (!DATE_RE.test(value)) return false;
  const date = startOfDate(value as DateString);
  return !Number.isNaN(date.getTime()) && toDateString(date) === value;
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

/** 昇順に並んだ期間をすべて覆う範囲（最初の期間の初日から最後の期間の末日）。期間が無ければ undefined */
export function coveringRange(ranges: readonly DateRange[]): DateRange | undefined {
  const [first] = ranges;
  const last = ranges.at(-1);
  return first && last ? { from: first.from, to: last.to } : undefined;
}

/** 年月（YYYY-MM）の全日を覆う範囲（両端含む） */
export function monthRange(month: string): DateRange {
  return { from: firstDayOfMonth(month), to: addDays(firstDayOfMonth(addMonths(month, 1)), -1) };
}

/** [from, to]（両端含む）に掛かる年月（YYYY-MM）を昇順で */
export function monthsInRange(from: DateString, to: DateString): string[] {
  const months: string[] = [];
  for (let m = toMonthString(from); m <= toMonthString(to); m = addMonths(m, 1)) months.push(m);
  return months;
}

/** 月を n か月ずらす */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}
