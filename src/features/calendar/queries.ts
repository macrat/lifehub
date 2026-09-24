import type { UseQueryResult } from '@tanstack/react-query';
import type { CalendarItem, CalendarPeriod } from '../../../shared/calendar.ts';
import type { DateString } from '../../../shared/types.ts';
import type { DailyWeather } from '../../../shared/weather.ts';
import { useCalendarPeriods } from '../events/queries.ts';

/** 項目を placementDate ごとにまとめる（順序はサーバーの並びを保つ） */
export function groupByDate(items: CalendarItem[]): Map<DateString, CalendarItem[]> {
  return Map.groupBy(items, (item) => item.placementDate);
}

/**
 * 日ごとの祝日（振替休日・国民の休日を含む）と天気。
 * まだ届いていない月や取れなかった月の日は、祝日でなく天気も無い扱い（どちらも補助の情報で、
 * カレンダーそのものは止めない）。
 */
export type CalendarDays = {
  holidays: ReadonlySet<DateString>;
  weather: ReadonlyMap<DateString, DailyWeather>;
};

/**
 * 月ごとの結果をまとめる。範囲の外の日が混ざっても引かれないだけなので、範囲では絞らない。
 * 範囲に依らない関数なので、モジュールに 1 つだけ置いて固定する（`useCalendarPeriods`）。
 */
function combineDays(results: UseQueryResult<CalendarPeriod>[]): CalendarDays {
  const periods = results.flatMap((result) => (result.data ? [result.data] : []));
  return {
    holidays: new Set(periods.flatMap((period) => period.holidays)),
    weather: new Map(periods.flatMap((period) => period.weather.map((w) => [w.date, w] as const))),
  };
}

/**
 * [from, to]（両端含む JST 暦日）の祝日と天気。項目と同じ月のキャッシュ（`useCalendarItems`）から読むので、
 * 項目を出している面なら問い合わせは増えない。
 */
export function useCalendarDays(range: { from: DateString; to: DateString }): CalendarDays {
  return useCalendarPeriods(range, combineDays);
}
