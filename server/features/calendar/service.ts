import { type CalendarPeriod, inRange } from '../../../shared/calendar.ts';
import type { DateRange } from '../../../shared/date.ts';
import { listItems } from '../events/service.ts';
import { listHolidays } from '../holidays/service.ts';
import { listWeather } from '../weather/service.ts';

/**
 * カレンダーの 1 期間分を返す関数を作る: 項目と、その期間の祝日・天気。
 * カレンダーの面（月のグリッド・週／日の見出し）はこの 3 つを必ず一緒に出すので、1 回の問い合わせで返す。
 * WHY NOT 祝日と天気を別の問い合わせで丸ごと配る: 面を出すたびに問い合わせが 3 本になり、
 * どちらも使うのは表示している期間だけなのに、取っておいた全期間（祝日は 1955 年から、
 * 天気は取り始めてからの毎日）を送ることになる。
 * どれも手元の表を読むだけで、外のサイトへは取りに行かない（配布元が遅い・落ちているときに項目まで待たせない）。
 *
 * 同じ時点に頼まれた期間はまとめて読む: すべての期間を覆う範囲を、項目・祝日・天気のそれぞれ 1 組の
 * 問い合わせで読み、期間ごとに分ける。画面は月ごとに 1 回ずつ呼び、それが 1 本の要求に載って届く
 * （docs/features/calendar.md の「API」）。「同じ時点」は `coalesceReads` と同じく `setImmediate` まで。
 * 作った関数は要求ごとに 1 つ使う（`routes.ts`）。別の要求の期間とはまとめない。
 */
export function calendarLoader(): (range: DateRange) => Promise<CalendarPeriod> {
  let pending: {
    range: DateRange;
    resolve: (period: CalendarPeriod) => void;
    reject: (reason: unknown) => void;
  }[] = [];

  const flush = async () => {
    const batch = pending;
    pending = [];
    try {
      const periods = await readPeriods(batch.map((item) => item.range));
      for (const [i, item] of batch.entries()) item.resolve(periods[i] as CalendarPeriod);
    } catch (error) {
      for (const item of batch) item.reject(error);
    }
  };

  return (range) =>
    new Promise((resolve, reject) => {
      if (pending.length === 0) setImmediate(flush);
      pending.push({ range, resolve, reject });
    });
}

/** 期間ごとの中身（並びは ranges と同じ）。すべての期間を覆う範囲を 1 組の問い合わせで読み、期間で分ける */
async function readPeriods(ranges: readonly DateRange[]): Promise<CalendarPeriod[]> {
  const whole = {
    from: ranges.map((range) => range.from).reduce((a, b) => (a < b ? a : b)),
    to: ranges.map((range) => range.to).reduce((a, b) => (a > b ? a : b)),
  };
  const [items, holidays, weather] = await Promise.all([
    listItems(whole),
    listHolidays(whole),
    listWeather(whole),
  ]);
  return ranges.map((range) => ({
    items: items.filter((item) => inRange(item.placementDate, range)),
    holidays: holidays.filter((date) => inRange(date, range)),
    weather: {
      daily: weather.daily.filter((w) => inRange(w.date, range)),
      hourly: weather.hourly.filter((w) => inRange(w.date, range)),
    },
  }));
}
