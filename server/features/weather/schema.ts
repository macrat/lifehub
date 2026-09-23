import { date, integer, pgTable, text } from 'drizzle-orm/pg-core';
import type { DateString } from '../../../shared/types.ts';

/**
 * 日ごとの天気（東京地方）。カレンダーの日付の横にアイコンを出すためだけに持つ。
 *
 * 気象庁の予報（`service.ts` の `FORECAST_URL`）を写したもので、取り直すたびに予報のある日の行を上書きする。
 * 予報から外れた過去の日は消さずに残すので、過去の日にはその日の最後の予報が残る
 * （気象庁の予報は今日より先しか配られず、実況の天気を日ごとに取る口は無い）。
 * 人が作る記録ではないので `created_by` などの共通の列は持たない。
 * 天気はコードだけを持ち、アイコンの種類と名前は読むときに `telops.ts` で引く。
 * 最高気温（℃）は予報に無い日（短期予報も週間予報も今日の分を出さなくなった後の今日など）があるので null を許し、
 * 上書きするときも値の無い報では前の値を残す（`repository.ts`）。
 */
export const weather = pgTable('weather', {
  date: date('date').$type<DateString>().primaryKey(),
  code: text('code').notNull(),
  tempMax: integer('temp_max'),
});
