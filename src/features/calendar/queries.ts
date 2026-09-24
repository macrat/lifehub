import { queryOptions, type UseQueryResult, useQueries, useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { CalendarItem } from '../../../shared/calendar.ts';
import type { DateString } from '../../../shared/types.ts';
import type { DailyWeather, HourlyWeather, WeatherInRange } from '../../../shared/weather.ts';
import { api, ensureOk } from '../../lib/api.ts';
import { monthRange, monthsInRange, toMonthString } from '../../lib/date.ts';
import { ONE_DAY, ONE_HOUR } from '../../lib/query-client.ts';

/** 項目を placementDate ごとにまとめる（順序はサーバーの並びを保つ） */
export function groupByDate(items: CalendarItem[]): Map<DateString, CalendarItem[]> {
  return Map.groupBy(items, (item) => item.placementDate);
}

const holidaysQueryOptions = queryOptions({
  queryKey: ['holidays'],
  queryFn: async (): Promise<DateString[]> => {
    const res = await ensureOk(await api.holidays.$get());
    return res.json();
  },
  /**
   * 1 日は取り直さない。
   * WHY: サーバーが配布元から取り直すのは月に 1 回で、それ以外に変わることが無い。読むのは
   * カレンダーの週の行・見出し（日付の数字を出す所）で、スワイプや表示の切り替えのたびにマウントし直すので、
   * 既定（staleTime: 0）だとそのたびに問い合わせることになる。
   */
  staleTime: ONE_DAY,
});

const EMPTY: ReadonlySet<DateString> = new Set();

function toSet(dates: DateString[]): ReadonlySet<DateString> {
  return new Set(dates);
}

/** 祝日（振替休日・国民の休日を含む）の集合。まだ届いていないか取れなかったときは空（どの日も平日の扱い） */
export function useHolidays(): ReadonlySet<DateString> {
  return useQuery({ ...holidaysQueryOptions, select: toSet }).data ?? EMPTY;
}

/**
 * 1 か月（JST 暦月）分の天気（日ごとと 3 時間ごと）。予定と同じく、キャッシュの単位を表示範囲ではなく暦月に固定する
 * （`events/queries.ts` の `calendarMonthQueryOptions`）。
 * WHY 暦月: 月・週・日のどの表示も同じ月のキャッシュに当たり、スワイプで隣の日・週へ移っても同じ月の間は
 * 問い合わせない。月をまたぐときも、スワイプの前後の面が先に描かれて隣の月を読み始めているので、移った先は待たない。
 * 1 か月分は日ごとの天気が最大 31 行、3 時間ごとの天気は同じ天気をまとめた区間が 1 日に数個で、どちらも小さい。
 * WHY NOT 日ごとと 3 時間ごとを分けて読む: 日表示は見出し（日ごと）と時刻の欄（3 時間ごと）の両方を出すので、
 * 分けると 1 画面で 2 回問い合わせる。月表示で使わない 3 時間ごとの分も、1 か月で数十の区間にしかならない。
 */
function weatherMonthQueryOptions(month: string) {
  return queryOptions({
    queryKey: ['weather', month],
    queryFn: async (): Promise<WeatherInRange> => {
      const res = await ensureOk(await api.weather.$get({ query: monthRange(month) }));
      return res.json();
    },
    /**
     * 1 時間は取り直さない。
     * WHY: サーバーが気象庁から取り直すのは 1 日 3 回で、読むのはスワイプや表示の切り替えのたびに
     * マウントし直す所（月の週の行・週と日の見出し・日表示の時刻の欄）なので、既定（staleTime: 0）だとそのたびに問い合わせる。
     * 祝日と違って 1 日持たないのは、朝の予報が夕方には変わっているため。
     */
    staleTime: ONE_HOUR,
  });
}

function toDailyMap(
  results: UseQueryResult<WeatherInRange>[],
): ReadonlyMap<DateString, DailyWeather> {
  return new Map(results.flatMap((r) => r.data?.daily ?? []).map((w) => [w.date, w]));
}

/**
 * 並んだ日（日付順）に掛かる月の、日ごとの天気。
 * 並びの外の日も入るが、引く側は自分の日だけを引くので絞らない。
 * まだ届いていないか取れなかった月の日は無い（その日にはアイコンを出さない）。
 */
export function useDailyWeather(
  days: readonly DateString[],
): ReadonlyMap<DateString, DailyWeather> {
  const [first, last] = [days[0], days.at(-1)];
  const months = first && last ? monthsInRange(first, last) : [];
  return useQueries({ queries: months.map(weatherMonthQueryOptions), combine: toDailyMap });
}

const NO_HOURLY: readonly HourlyWeather[] = [];

/**
 * その日の 3 時間ごとの天気（同じ天気が続く区間。時刻順）。
 * まだ届いていないか取れなかったとき、予報の無い日（取り始める前の日・明後日から）は空（何も出さない）。
 */
export function useHourlyWeather(date: DateString): readonly HourlyWeather[] {
  const select = useCallback(
    ({ hourly }: WeatherInRange) => hourly.filter((w) => w.date === date),
    [date],
  );
  return useQuery({ ...weatherMonthQueryOptions(toMonthString(date)), select }).data ?? NO_HOURLY;
}
