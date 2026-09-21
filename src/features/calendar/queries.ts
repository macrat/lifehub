import { queryOptions } from '@tanstack/react-query';
import type { CalendarItem } from '../../../shared/calendar.ts';
import type { DateString } from '../../../shared/types.ts';
import { api, ensureOk } from '../../lib/api.ts';

/** 項目の形はサーバーと共有する（楽観的更新もこの形で組み立てる。shared/calendar.ts） */
export type { CalendarItem } from '../../../shared/calendar.ts';
export type CalendarEventItem = Extract<CalendarItem, { kind: 'event' }>;
export type CalendarTaskItem = Extract<CalendarItem, { kind: 'task' }>;

export const CALENDAR_QUERY_KEY = ['calendar'] as const;

/** [from, to]（両端含む JST 暦日）の項目。予定・タスクの書き込み後は CALENDAR_QUERY_KEY を invalidate する。 */
export function calendarItemsQueryOptions(range: { from: DateString; to: DateString }) {
  return queryOptions({
    queryKey: [...CALENDAR_QUERY_KEY, range.from, range.to],
    // 返り値を共通の型で受けることで、サーバーの応答と楽観的更新の形がずれたら型検査で気づける
    queryFn: async (): Promise<CalendarItem[]> => {
      const res = await ensureOk(await api.events.$get({ query: range }));
      return res.json();
    },
    // 表示のたびに取り直す（キャッシュはまず出す）。永続化キャッシュは書き込みが 1 秒遅れるため、
    // 変更直後に再読み込みすると古い一覧が復元されることがあり、既定の staleTime だとそれが残る
    staleTime: 0,
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
