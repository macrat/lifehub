import { date, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type { DateString } from '../../../shared/types.ts';

/**
 * 日ごとの天気（東京地方）。カレンダーの日付の横のアイコン、ホームの天気のタイル、週間天気の画面に出すために持つ。
 *
 * 気象庁の予報（`service.ts` の `FORECAST_URL`）を写したもので、取り直すたびに予報のある日の行を上書きする。
 * 予報から外れた過去の日は消さずに残すので、過去の日にはその日の最後の予報が残る
 * （気象庁の予報は今日より先しか配られず、実況の天気を日ごとに取る口は無い）。
 * 人が作る記録ではないので `created_by` などの共通の列は持たない。
 * 天気はコードだけを持ち、アイコンの種類と名前は読むときに `telops.ts` で引く。
 * 最高・最低気温（℃）と降水確率（%）は予報に無い日（短期予報も週間予報も今日の分を出さなくなった後の今日など）が
 * あるので null を許し、上書きするときも値の無い報では前の値を残す（`repository.ts`）。
 * 終わった日の最高・最低気温は、毎朝アメダスの観測値で予報の値を上書きする（`service.ts` の `recordObservedTemps`）。
 * 降水確率は観測で置き換える値が無いので、終わった日にはその日の最後の予報が残る。
 */
export const weather = pgTable('weather', {
  date: date('date').$type<DateString>().primaryKey(),
  code: text('code').notNull(),
  tempMax: integer('temp_max'),
  tempMin: integer('temp_min'),
  pop: integer('pop'),
});

/**
 * 3 時間ごとの天気（東京地方）。カレンダーの日表示の時刻の左に、天気の変わり目を出すためだけに持つ。
 *
 * 気象庁の天気分布予報（`service.ts` の `HOURLY_URL`）を写したもので、取り直すたびに予報のある時間帯の行を上書きする。
 * 予報から外れた過ぎた時間帯は消さずに残すので、過ぎた時間帯にはその時間帯の最後の予報が残る
 * （日ごとの天気と同じく、予報は先の時間帯しか配られない）。
 * 天気は気象庁の天気の名前（「晴れ」「くもり」など）のまま持ち、アイコンの種類は読むときに `telops.ts` で引く。
 */
export const weatherHourly = pgTable('weather_hourly', {
  startsAt: timestamp('starts_at', { withTimezone: true }).primaryKey(),
  weather: text('weather').notNull(),
});
