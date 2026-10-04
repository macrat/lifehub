import type { CalendarPeriod } from '../../../shared/calendar.ts';
import { monthRange, toMonthString } from '../../../shared/date.ts';
import { listItemsByRange } from '../events/service.ts';
import { listHolidays } from '../holidays/service.ts';
import { listWeather } from '../weather/service.ts';

/**
 * カレンダーの月（JST 暦月）ごとの中身: 項目と、その月の祝日・天気。月を鍵にして返す。
 * カレンダーの面（月のグリッド・週／日の見出し）はこの 3 つを必ず一緒に出すので、1 回の問い合わせで返す。
 * WHY NOT 祝日と天気を別の問い合わせで丸ごと配る: 面を出すたびに問い合わせが 3 本になり、
 * どちらも使うのは表示している期間だけなのに、取っておいた全期間（祝日は 1955 年から、
 * 天気は取り始めてからの毎日）を送ることになる。
 * どれも手元の表を読むだけで、外のサイトへは取りに行かない（配布元が遅い・落ちているときに項目まで待たせない）。
 *
 * 頼まれた月をすべて覆う範囲（最初の月の 1 日から最後の月の末日）を、項目・祝日・天気のそれぞれ 1 組の
 * 問い合わせで読み、月ごとに分ける。クライアントはキャッシュを月ごとに持つ（`calendarMonthQueryOptions`）が、
 * 同じ時点に要る月はまとめて 1 回で頼む。
 * WHY NOT 月ごとに読む: 同じ形の問い合わせが月の数だけ繰り返され（N+1）、文の数と DB の負荷が月の数に比例する。
 * 間の空いた月を頼まれても範囲は 1 つにまとめる（間の月も読んで捨てる）。カレンダーが同じ時点に要る月は
 * ほぼ続いているので、範囲を分けて問い合わせを増やすより安い。
 */
export async function getCalendar(
  months: readonly string[],
): Promise<Record<string, CalendarPeriod>> {
  const sorted = [...new Set(months)].sort();
  const ranges = sorted.map(monthRange);
  const [first] = ranges;
  const last = ranges.at(-1);
  if (!first || !last) return {};
  const whole = { from: first.from, to: last.to };
  const [items, holidays, weather] = await Promise.all([
    listItemsByRange(ranges),
    listHolidays(whole),
    listWeather(whole),
  ]);
  const holidaysOf = Map.groupBy(holidays, toMonthString);
  const dailyOf = Map.groupBy(weather.daily, (w) => toMonthString(w.date));
  const hourlyOf = Map.groupBy(weather.hourly, (w) => toMonthString(w.date));
  return Object.fromEntries(
    sorted.map((month, i) => [
      month,
      {
        items: items[i] ?? [],
        holidays: holidaysOf.get(month) ?? [],
        weather: { daily: dailyOf.get(month) ?? [], hourly: hourlyOf.get(month) ?? [] },
      },
    ]),
  );
}
