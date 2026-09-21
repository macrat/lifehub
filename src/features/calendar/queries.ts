import { queryOptions, useQueries } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import type { DateString } from '../../../shared/types.ts';
import { api, ensureOk } from '../../lib/api.ts';
import { monthRange, monthsInRange } from '../../lib/date.ts';

export type CalendarItem = InferResponseType<typeof api.events.$get, 200>[number];
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
export function calendarMonthQueryOptions(month: string) {
  return queryOptions({
    queryKey: [...CALENDAR_QUERY_KEY, month],
    queryFn: async () => {
      const res = await ensureOk(await api.events.$get({ query: monthRange(month) }));
      return res.json();
    },
  });
}

/**
 * [from, to]（両端含む JST 暦日）の項目。範囲に掛かる月のキャッシュを繋いで返す。
 * 揃っていない月だけが後から埋まるので、既に持っている月は待たずに表示できる。
 */
export function useCalendarItems(range: { from: DateString; to: DateString }): {
  items: CalendarItem[];
  error: Error | null;
} {
  return useQueries({
    queries: monthsInRange(range.from, range.to).map(calendarMonthQueryOptions),
    combine: (results) => ({
      // 月は互いに重ならず昇順なので、範囲で絞って繋ぐだけで重複せず placementDate 順も保たれる
      // （月をまたぐ予定はサーバーが日ごとの項目にして返すため、月ごとに別の日として分かれる）
      items: results
        .flatMap((result) => result.data ?? [])
        .filter((item) => item.placementDate >= range.from && item.placementDate <= range.to),
      error: results.find((result) => result.error)?.error ?? null,
    }),
  });
}

/** 項目の色を決めるユーザー: 参加者が 1 人ならその人、複数ならアプリ既定の色（null） */
export function colorUserOf(item: CalendarItem): string | null {
  return item.participantIds.length === 1 ? (item.participantIds[0] ?? null) : null;
}

/** タスクを時刻で示すときの基準: 期限 → 開始の優先。どちらも無ければ null */
export function taskTime(item: CalendarTaskItem): { kind: 'due' | 'start'; at: string } | null {
  if (item.endsAt) return { kind: 'due', at: item.endsAt };
  if (item.startsAt) return { kind: 'start', at: item.startsAt };
  return null;
}

/** 項目を placementDate ごとにまとめる（順序はサーバーの並びを保つ） */
export function groupByDate(items: CalendarItem[]): Map<DateString, CalendarItem[]> {
  const map = new Map<DateString, CalendarItem[]>();
  for (const item of items) {
    const list = map.get(item.placementDate) ?? [];
    list.push(item);
    map.set(item.placementDate, list);
  }
  return map;
}
