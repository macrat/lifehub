import { z } from 'zod';
import { diffMonths, isDateString } from '../date.ts';

/** 年月（YYYY-MM）。月の 1 日が実在する暦日か（`firstDayOfMonth` と同じ規則）で確かめる */
const monthSchema = z
  .string()
  .refine((month) => isDateString(`${month}-01`), '年月は YYYY-MM 形式で指定してください');

/**
 * 一度に読める月の幅（最初の月から最後の月まで）。頼まれた月はその幅を 1 つの範囲として読んで展開する
 * （`server/features/calendar/service.ts`）ので、読む量は月の数ではなく幅で決まる。カレンダーが同じ時点に
 * 要る月（面の前後のページ・リストで広げた月・選択ダイアログの月）はこれより十分狭い。
 * 上限は、1 回の要求で何十年分も展開させないためだけにある。
 */
const MAX_SPAN_MONTHS = 120;

/**
 * カレンダーの月ごとの中身の取得（`calendar.get`）。同じ時点に要る月をまとめて 1 回で頼む（並びも重複も問わない）
 */
export const calendarQuerySchema = z.object({
  months: z
    .array(monthSchema)
    .min(1)
    .max(MAX_SPAN_MONTHS)
    .refine((months) => {
      const sorted = months.toSorted();
      return diffMonths(sorted[0] ?? '', sorted.at(-1) ?? '') < MAX_SPAN_MONTHS;
    }, `一度に読める月は ${MAX_SPAN_MONTHS} か月の幅までです`),
});
