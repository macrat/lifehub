import { queryOptions, useQuery } from '@tanstack/react-query';
import type { CalendarItem } from '../../../shared/calendar.ts';
import { addDays } from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';
import type { DailyWeather, HourlyWeather } from '../../../shared/weather.ts';
import { api, ensureOk } from '../../lib/api.ts';
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

const weatherQueryOptions = queryOptions({
  queryKey: ['weather'],
  queryFn: async (): Promise<DailyWeather[]> => {
    const res = await ensureOk(await api.weather.$get());
    return res.json();
  },
  /**
   * 1 時間は取り直さない。
   * WHY: サーバーが気象庁から取り直すのは 1 日 3 回で、読むのはスワイプや表示の切り替えのたびに
   * マウントし直す所（月の週の行・日表示の見出し）なので、既定（staleTime: 0）だとそのたびに問い合わせる。
   * 祝日と違って 1 日持たないのは、朝の予報が夕方には変わっているため。
   */
  staleTime: ONE_HOUR,
});

const NO_WEATHER: ReadonlyMap<DateString, DailyWeather> = new Map();

function toMap(list: DailyWeather[]): ReadonlyMap<DateString, DailyWeather> {
  return new Map(list.map((w) => [w.date, w]));
}

/** 日ごとの天気。まだ届いていないか取れなかったときは空（どの日にもアイコンを出さない） */
export function useWeather(): ReadonlyMap<DateString, DailyWeather> {
  return useQuery({ ...weatherQueryOptions, select: toMap }).data ?? NO_WEATHER;
}

const hourlyWeatherKey = (date: DateString) => ['weather', 'hourly', date] as const;

/**
 * その日の 3 時間ごとの天気。サーバーは前後 1 日の分も一緒に返すので、それを前後の日の分として置いておく。
 * WHY: 日表示で隣の日へスワイプしたとき、新しく端に来る面（2 日先）の分がもう手元にあり、問い合わせを待たずに出せる。
 * 隣の日の分は、先に置いてあっても新しく受け取った分で置き直す（どちらも同じ所から取った値で、新しいほうが新しい予報）。
 */
function hourlyWeatherQueryOptions(date: DateString) {
  return queryOptions({
    queryKey: hourlyWeatherKey(date),
    queryFn: async ({ client }): Promise<HourlyWeather[]> => {
      const res = await ensureOk(await api.weather.hourly.$get({ query: { date } }));
      const spans = await res.json();
      const on = (day: DateString) => spans.filter((w) => w.date === day);
      for (const day of [addDays(date, -1), addDays(date, 1)]) {
        client.setQueryData(hourlyWeatherKey(day), on(day));
      }
      return on(date);
    },
    // 日ごとの天気と同じ理由（サーバーの取り直しが 1 日 3 回で、日表示はスワイプのたびにマウントし直す）
    staleTime: ONE_HOUR,
  });
}

const NO_HOURLY: readonly HourlyWeather[] = [];

/**
 * その日の 3 時間ごとの天気（同じ天気が続く区間。時刻順）。
 * まだ届いていないか取れなかったとき、予報の無い日（取り始める前の日・明後日から）は空（何も出さない）。
 */
export function useHourlyWeather(date: DateString): readonly HourlyWeather[] {
  return useQuery(hourlyWeatherQueryOptions(date)).data ?? NO_HOURLY;
}
