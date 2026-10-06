import { addDays, firstDayOfMonth, today, toMonthString } from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';
import { formatMonth, weekdayIndex } from '../../lib/date.ts';

/**
 * カレンダーの画面だけが使う日の並び（月のグリッド・週。月曜始まり）と、その見出し。
 * 表示の書式・月の計算・曜日の色のようにほかの画面も使う物は `lib/date.ts`。
 */

/** 曜日の見出し（月曜始まり） */
export const WEEKDAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'] as const;

/** 月表示のグリッドの 6 週。各要素はその週の月曜で、先頭はその月の 1 日を含む週。 */
export function monthGridWeeks(month: string): DateString[] {
  const start = weekStart(firstDayOfMonth(month));
  return Array.from({ length: 6 }, (_, i) => addDays(start, i * 7));
}

/** 月表示のグリッドの 42 日（月曜始まり、6 週） */
export function monthGridDays(month: string): DateString[] {
  return monthGridWeeks(month).flatMap(weekDays);
}

/** その日を含む週（月曜始まり）の 7 日 */
export function weekDays(date: DateString): DateString[] {
  const start = weekStart(date);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** その日を含む週（月曜始まり）の月曜 */
export function weekStart(date: DateString): DateString {
  return addDays(date, -weekdayIndex(date));
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
