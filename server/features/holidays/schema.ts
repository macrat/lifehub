import { date, pgTable } from 'drizzle-orm/pg-core';
import type { DateString } from '../../../shared/types.ts';

/**
 * 日本の祝日・休日（振替休日・国民の休日を含む）。カレンダーで日付を赤く出すためだけに持つ。
 *
 * 外部の ics（`service.ts` の `HOLIDAYS_URL`）を写したもので、アプリの中から書き換えることは無い。
 * 取り直すたびに全行を入れ替える。人が作る記録ではないので `created_by` などの共通の列は持たない。
 * 使うのは日付だけなので、祝日の名前も持たない。
 */
export const holidays = pgTable('holidays', {
  date: date('date').$type<DateString>().primaryKey(),
});
