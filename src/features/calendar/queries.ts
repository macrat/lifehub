import { queryOptions, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { CalendarItem } from '../../../shared/calendar.ts';
import type { DateString } from '../../../shared/types.ts';
import { api, ensureOk } from '../../lib/api.ts';
import { monthRange, monthsInRange } from '../../lib/date.ts';
import { ONE_DAY, type QueryState } from '../../lib/query-client.ts';

/** 項目の形はサーバーと共有する（楽観的更新もこの形で組み立てる。shared/calendar.ts） */
export type { CalendarItem } from '../../../shared/calendar.ts';
export type CalendarEventItem = Extract<CalendarItem, { kind: 'event' }>;
export type CalendarTaskItem = Extract<CalendarItem, { kind: 'task' }>;

export const CALENDAR_QUERY_KEY = ['calendar'] as const;

/**
 * 1 か月（JST 暦月）分の項目。キャッシュの単位を表示範囲ではなく暦月に固定する。
 * 月・週・日・リストのどの表示も、同じ日を見ているなら同じ月のキャッシュに当たるので、
 * 表示や日付を切り替えても手元の内容をそのまま出したまま裏で取り直せる
 * （範囲をキーにすると切り替えのたびに別のキーになり、必ず一度空になる）。
 * 予定・タスクの書き込み後は CALENDAR_QUERY_KEY を invalidate する。
 */
function calendarMonthQueryOptions(month: string) {
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
    queryFn: async (): Promise<CalendarItem[]> => {
      const res = await ensureOk(await api.events.$get({ query: monthRange(month) }));
      return res.json();
    },
  });
}

/**
 * [from, to]（両端含む JST 暦日）の項目。範囲に掛かる月のキャッシュを繋いで返す。
 * 揃っていない月だけが後から埋まるので、既に持っている月は待たずに表示できる。
 * どの月もまだ手元に無いときだけ data が undefined になる（画面はそれを見て骨組みを出す）。
 */
export function useCalendarItems(range: {
  from: DateString;
  to: DateString;
}): QueryState<CalendarItem[]> {
  return useQueries({
    queries: monthsInRange(range.from, range.to).map(calendarMonthQueryOptions),
    combine: (results) => ({
      // 月は互いに重ならず昇順なので、範囲で絞って繋ぐだけで重複せず placementDate 順も保たれる
      // （月をまたぐ予定はサーバーが日ごとの項目にして返すため、月ごとに別の日として分かれる）
      data: results.some((result) => result.data !== undefined)
        ? results
            .flatMap((result) => result.data ?? [])
            .filter((item) => item.placementDate >= range.from && item.placementDate <= range.to)
        : undefined,
      error: results.find((result) => result.error)?.error ?? null,
    }),
  });
}

/**
 * カレンダーの項目を出す画面（カレンダー・ホームの「今日」カード）が、入ったときに取り直すためのもの。
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
 * 色を決めるユーザー: 参加者が 1 人ならその人、そうでなければ共有の無彩色（null）。
 * 保存済みの項目と、まだ保存していない下書きの枠で同じ規則を使う。
 */
export function colorUserOf(participantIds: string[]): string | null {
  return participantIds.length === 1 ? (participantIds[0] ?? null) : null;
}

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
