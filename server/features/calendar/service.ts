import type { CalendarPeriod } from '../../../shared/calendar.ts';
import type { DateRange } from '../../../shared/date.ts';
import { listItems } from '../events/service.ts';
import { listHolidays } from '../holidays/service.ts';
import { listWeather } from '../weather/service.ts';

/**
 * カレンダーの 1 期間分: 項目と、その期間の祝日・天気。
 * カレンダーの面（月のグリッド・週／日の見出し）はこの 3 つを必ず一緒に出すので、1 回の問い合わせで返す。
 * WHY NOT 祝日と天気を別の問い合わせで丸ごと配る: 面を出すたびに問い合わせが 3 本になり、
 * どちらも使うのは表示している期間だけなのに、取っておいた全期間（祝日は 1955 年から、
 * 天気は取り始めてからの毎日）を送ることになる。
 * どれも手元の表を読むだけで、外のサイトへは取りに行かない（配布元が遅い・落ちているときに項目まで待たせない）。
 */
export async function getCalendar(range: DateRange): Promise<CalendarPeriod> {
  const [items, holidays, weather] = await Promise.all([
    listItems(range),
    listHolidays(range),
    listWeather(range),
  ]);
  return { items, holidays, weather };
}
