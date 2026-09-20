import { queryOptions } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import type { DateString } from '../../../shared/types.ts';
import { api, ensureOk } from '../../lib/api.ts';

export type CalendarItem = InferResponseType<typeof api.calendar.items.$get, 200>[number];
export type CalendarEventItem = Extract<CalendarItem, { kind: 'event' }>;
export type CalendarTaskItem = Extract<CalendarItem, { kind: 'task' }>;

export const CALENDAR_QUERY_KEY = ['calendar'] as const;

/** [from, to]（両端含む JST 暦日）の統合項目。予定・タスクの書き込み後は CALENDAR_QUERY_KEY を invalidate する。 */
export function calendarItemsQueryOptions(range: { from: DateString; to: DateString }) {
  return queryOptions({
    queryKey: [...CALENDAR_QUERY_KEY, range.from, range.to],
    queryFn: async () => {
      const res = await ensureOk(await api.calendar.items.$get({ query: range }));
      return res.json();
    },
  });
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
