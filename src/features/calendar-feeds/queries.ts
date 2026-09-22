import { queryOptions } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import type { CalendarFeedInput } from '../../../shared/validation/calendar-feeds.ts';
import { api, ensureOk } from '../../lib/api.ts';
import { useOptimisticMutation } from '../../lib/query-client.ts';

/** カレンダーの ics 配信 URL（[docs/features/calendar-feeds.md](../../../docs/features/calendar-feeds.md)） */
export type CalendarFeed = InferResponseType<typeof api.calendar.feeds.$get>[number];

export const calendarFeedsQueryOptions = queryOptions({
  queryKey: ['calendar-feeds'],
  queryFn: async () => (await ensureOk(await api.calendar.feeds.$get())).json(),
});

/**
 * 発行。オフラインでは溜めずにその場で失敗させる（`queue: false`）。
 * 発行された URL はサーバーが作る乱数なので、送れるまで待っても画面には何も出せない。
 * 同じ理由で楽観的更新の `apply` も持たない（出す値を先に作れない）。
 */
export function useCreateCalendarFeed() {
  return useOptimisticMutation({
    request: (input: CalendarFeedInput) => ({
      method: 'POST' as const,
      path: api.calendar.feeds.$url().pathname,
      body: input,
    }),
    queue: false,
    keys: [calendarFeedsQueryOptions.queryKey],
  });
}

/**
 * 名前と参加者の変更。発行・失効と揃えてオフラインでは溜めない。
 * 「もうこの URL からは相手の予定が見えない」ことを確かめたい操作なので、
 * 送れたかどうかが分からないまま変わって見えるのは困る。
 */
export function useUpdateCalendarFeed() {
  return useOptimisticMutation({
    request: ({ id, ...input }: CalendarFeedInput & { id: string }) => ({
      method: 'PATCH' as const,
      path: api.calendar.feeds[':id'].$url({ param: { id } }).pathname,
      body: input,
    }),
    queue: false,
    keys: [calendarFeedsQueryOptions.queryKey],
    apply: (client, { id, ...input }) => {
      client.setQueryData(calendarFeedsQueryOptions.queryKey, (feeds) =>
        feeds?.map((feed) => (feed.id === id ? { ...feed, ...input } : feed)),
      );
    },
  });
}

/**
 * 失効。発行と揃えてオフラインでは溜めない。
 * 「もう読めない」ことを確かめたい操作なので、送れたかどうかが分からないまま消えて見えるのは困る。
 */
export function useRevokeCalendarFeed() {
  return useOptimisticMutation({
    request: (id: string) => ({
      method: 'DELETE' as const,
      path: api.calendar.feeds[':id'].$url({ param: { id } }).pathname,
    }),
    queue: false,
    keys: [calendarFeedsQueryOptions.queryKey],
    apply: (client, id) => {
      client.setQueryData(calendarFeedsQueryOptions.queryKey, (feeds) =>
        feeds?.filter((feed) => feed.id !== id),
      );
    },
  });
}
