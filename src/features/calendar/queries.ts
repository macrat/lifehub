import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import type { CalendarPeriod } from '../../../shared/calendar.ts';
import type { DateString } from '../../../shared/types.ts';
import type { DailyWeather, HourlyWeather } from '../../../shared/weather.ts';
import { toMonthString } from '../../lib/date.ts';
import { calendarMonthQueryOptions, useCalendarPeriods } from '../events/queries.ts';

/**
 * 日ごとの祝日（振替休日・国民の休日を含む）と天気。
 * まだ届いていない月の日と表に無い日は、祝日でなく天気も無い扱い（その日は平日の色で、アイコンを出さない）。
 */
export type CalendarDays = {
  holidays: ReadonlySet<DateString>;
  weather: ReadonlyMap<DateString, DailyWeather>;
};

/** 届いている月の中身。取り直しの始まり・終わりでは中身が変わらないので、前と同じ配列が返る */
function receivedPeriods(results: UseQueryResult<CalendarPeriod>[]): CalendarPeriod[] {
  return results.flatMap((result) => (result.data ? [result.data] : []));
}

/**
 * 並んだ日（日付順）の祝日と日ごとの天気。項目と同じ月のキャッシュ（`useCalendarItems`）から読むので、
 * 項目を出している面なら問い合わせは増えない。並びの外の日も入るが、引く側は自分の日だけを引くので絞らない。
 * 集合と表は届いた中身が変わったときだけ作り直す（Set / Map は前の値と比べて使い回されないので、
 * 作り直すと読む側がそのたびに描き直す）。
 */
export function useCalendarDays(days: readonly DateString[]): CalendarDays {
  const from = days[0];
  const to = days.at(-1);
  const periods = useCalendarPeriods(from && to ? { from, to } : null, receivedPeriods);
  return useMemo(
    () => ({
      holidays: new Set(periods.flatMap((period) => period.holidays)),
      weather: new Map(
        periods.flatMap((period) => period.weather.daily.map((w) => [w.date, w] as const)),
      ),
    }),
    [periods],
  );
}

const NO_HOURLY: readonly HourlyWeather[] = [];

/**
 * その日の 3 時間ごとの天気（同じ天気が続く区間。時刻順）。項目と同じ月のキャッシュから読む。
 * まだ届いていないとき、予報の無い日（取り始める前の日・明後日から）は空（何も出さない）。
 */
export function useHourlyWeather(date: DateString): readonly HourlyWeather[] {
  const select = useCallback(
    ({ weather }: CalendarPeriod) => weather.hourly.filter((w) => w.date === date),
    [date],
  );
  return useQuery({ ...calendarMonthQueryOptions(toMonthString(date)), select }).data ?? NO_HOURLY;
}
