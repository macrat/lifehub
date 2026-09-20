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
    // 表示のたびに取り直す（キャッシュはまず出す）。永続化キャッシュは書き込みが 1 秒遅れるため、
    // 変更直後に再読み込みすると古い一覧が復元されることがあり、既定の staleTime だとそれが残る
    staleTime: 0,
  });
}

/** 項目の所有者（予定）・担当者（タスク）。null は共有 */
export function ownerOf(item: CalendarItem): string | null {
  return item.kind === 'event' ? item.ownerUserId : item.assigneeUserId;
}

/** タスクを時刻で示すときの基準: 期限 → 開始の優先。どちらも無ければ null */
export function taskTime(item: CalendarTaskItem): { kind: 'due' | 'start'; at: string } | null {
  if (item.dueAt) return { kind: 'due', at: item.dueAt };
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
