import { z } from 'zod';
import { diffMonths, isMonthString } from '../date.ts';

/** 年月（YYYY-MM） */
const monthSchema = z.string().refine(isMonthString, '年月は YYYY-MM 形式で指定してください');

/**
 * 一度に読める月の幅（最初の月から最後の月まで）。頼まれた月はその幅を 1 つの範囲として読んで展開する
 * （`server/features/calendar/service.ts`）ので、読む量は月の数ではなく幅で決まる。カレンダーが同じ時点に
 * 要る月（面の前後のページ・リストで広げた月・選択ダイアログの月）はこれより十分狭い。
 * 上限は、1 回の要求で何十年分も展開させないためだけにある。
 */
const MAX_SPAN_MONTHS = 120;

/**
 * カレンダーの月ごとの中身の取得（`calendar.get`）。同じ時点に要る月をまとめて 1 回で頼む。
 * 並びも重複も問わずに受け、重複を除いて昇順に並べた空でない一覧にする（読む側は最初と最後の月で範囲を決める）
 */
export const calendarQuerySchema = z.object({
  months: z
    .array(monthSchema)
    .min(1)
    .max(MAX_SPAN_MONTHS)
    .transform((months) => [...new Set(months)].sort() as [string, ...string[]])
    .refine(
      (months) => diffMonths(months[0], months.at(-1) ?? months[0]) < MAX_SPAN_MONTHS,
      `一度に読める月は ${MAX_SPAN_MONTHS} か月の幅までです`,
    ),
});
