import { queryOptions, type UseQueryResult, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import { type CalendarItem, type CalendarPeriod, inRange } from '../../../shared/calendar.ts';
import type { DateRange } from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';
import type { DailyWeather, HourlyWeather } from '../../../shared/weather.ts';
import { api } from '../../lib/api.ts';
import { monthRange, monthsInRange, toMonthString } from '../../lib/date.ts';
import { type QueryState, useStoreQueries, useStoreQuery } from '../../lib/screen-data.ts';
import { CALENDAR_QUERY_KEY } from '../events/query-keys.ts';

/**
 * 1 か月（JST 暦月）分の項目と、その月の祝日・天気。キャッシュの単位を表示範囲ではなく暦月に固定する。
 * 月・週・日・リストのどの表示も、同じ日を見ているなら同じ月のキャッシュに当たるので、
 * 表示や日付を切り替えても手元の内容をそのまま出したまま裏で取り直せる
 * （範囲をキーにすると切り替えのたびに別のキーになり、必ず一度空になる）。
 * 予定・タスクの書き込み後は CALENDAR_QUERY_KEY を invalidate する。
 */
export function calendarMonthQueryOptions(month: string) {
  return queryOptions({
    queryKey: [...CALENDAR_QUERY_KEY, month],
    /**
     * 一度取った月は古くならない。取り直しは画面に入ったとき（`useRefreshCalendarItems`）と
     * 書き込みの後（`useOptimisticMutation` の invalidate）にだけ起こす。
     * WHY: 月・週・日・リストの切り替えは同じ月のキャッシュを読むだけで、内容は変わらない。
     * 既定（staleTime: 0）だと切り替えのたびに読む側が付け替わって、そこで毎回取り直しになる。
     * WHY NOT 'static': 'static' は invalidate や refetch でも取り直さなくなり、書き込み後に
     * サーバーの値へ合わせられない。
     */
    staleTime: Number.POSITIVE_INFINITY,
    // 返り値を共通の型で受けることで、サーバーの応答と楽観的更新の形がずれたら型検査で気づける
    queryFn: ({ signal }): Promise<CalendarPeriod> =>
      api.calendar.get.query(monthRange(month), { signal }),
  });
}

/**
 * [from, to]（両端含む JST 暦日）に掛かる月のクエリを store から読み、`combine` でまとめる
 * （購読はカレンダーの画面が、表示に掛かる月をまとめて行う。`use-calendar-page.ts` の `months`）。
 * `combine` は範囲ごとに固定した関数を渡す: TanStack Query は combine が前と別の関数だと、
 * 結果が変わっていなくても描くたびに繋ぎ直し、前の結果と中身を 1 件ずつ比べ直す（replaceEqualDeep）。
 * カレンダーはドラッグの 1 コマごとに描き直すので、そのたびに全項目を繋いで比べることになる。
 */
function useCalendarPeriods<T>(
  range: DateRange | null,
  combine: (results: UseQueryResult<CalendarPeriod>[]) => T,
): T {
  const months = range ? monthsInRange(range.from, range.to) : [];
  return useStoreQueries(months.map(calendarMonthQueryOptions), combine);
}

/**
 * [from, to]（両端含む JST 暦日）の項目。範囲に掛かる月のキャッシュを繋いで返す。
 * 揃っていない月だけが後から埋まるので、既に持っている月は待たずに表示できる。
 * どの月もまだ手元に無いときだけ data が undefined になる（画面はそれを見て骨組みを出す）。
 * complete は範囲のすべての月が揃っているか（揃ってから位置を決めたい画面が見る）。
 */
export function useCalendarItems(
  range: DateRange,
): QueryState<CalendarItem[]> & { complete: boolean } {
  const { from, to } = range;
  const combine = useCallback(
    (results: UseQueryResult<CalendarPeriod>[]) => ({
      // 月は互いに重ならず昇順なので、範囲で絞って繋ぐだけで重複せず placementDate 順も保たれる
      // （月をまたぐ予定はサーバーが日ごとの項目にして返すため、月ごとに別の日として分かれる）
      data: results.some((result) => result.data !== undefined)
        ? results
            .flatMap((result) => result.data?.items ?? [])
            .filter((item) => inRange(item.placementDate, { from, to }))
        : undefined,
      error: results.find((result) => result.error)?.error ?? null,
      complete: results.every((result) => result.data !== undefined),
    }),
    [from, to],
  );
  return useCalendarPeriods(range, combine);
}

/**
 * カレンダー画面が、入ったときに取り直すためのもの。
 * マウントの 1 回だけ取り直すので、同じ画面に留まる限り（表示や日付の切り替え）取り直しは起きない。
 * 画面を行き来したとき（マウントし直す）と、再読み込みしたとき（読み込み直す）だけサーバーに問い合わせる。
 *
 * 出している月はその場で取り直し、キャッシュにあるだけの月は古い印を付ける（次に出すときに取り直す）。
 * cancelRefetch: false = 始まっている取得はそのまま使う（初回表示の取得を中断して二重に投げない）。
 */
export function useRefreshCalendarItems() {
  const queryClient = useQueryClient();
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: CALENDAR_QUERY_KEY }, { cancelRefetch: false });
  }, [queryClient]);
}

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
  return (
    useStoreQuery({ ...calendarMonthQueryOptions(toMonthString(date)), select }).data ?? NO_HOURLY
  );
}
