import type { CalendarPeriod } from '../../../shared/calendar.ts';
import { monthRange, toMonthString } from '../../../shared/date.ts';
import { listItems } from '../events/service.ts';
import { listHolidays } from '../holidays/service.ts';
import { listWeather } from '../weather/service.ts';

/**
 * カレンダーの月（JST 暦月）ごとの中身: 項目と、その月の祝日・天気。月を鍵にして返す。
 * 頼まれた月をすべて覆う範囲を、項目・祝日・天気のそれぞれ 1 組の問い合わせで読み、月ごとに分ける。
 * 3 つを 1 回で返す理由、月ごとに読まない理由、まとめて読んでも月ごとに読んだものと同じになる理由は
 * docs/features/calendar.md の「API」。
 */
export async function getCalendar(
  months: readonly string[],
): Promise<Record<string, CalendarPeriod>> {
  const sorted = [...new Set(months)].sort();
  const first = sorted[0];
  const last = sorted.at(-1);
  if (!first || !last) return {};
  const whole = { from: monthRange(first).from, to: monthRange(last).to };
  const [items, holidays, weather] = await Promise.all([
    listItems(whole),
    listHolidays(whole),
    listWeather(whole),
  ]);
  const itemsOf = Map.groupBy(items, (item) => toMonthString(item.placementDate));
  const holidaysOf = Map.groupBy(holidays, toMonthString);
  const dailyOf = Map.groupBy(weather.daily, (w) => toMonthString(w.date));
  const hourlyOf = Map.groupBy(weather.hourly, (w) => toMonthString(w.date));
  return Object.fromEntries(
    sorted.map((month) => [
      month,
      {
        items: itemsOf.get(month) ?? [],
        holidays: holidaysOf.get(month) ?? [],
        weather: { daily: dailyOf.get(month) ?? [], hourly: hourlyOf.get(month) ?? [] },
      },
    ]),
  );
}
