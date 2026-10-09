import { queryOptions } from '@tanstack/react-query';
import { type ApiOutputs, api, write } from '../../lib/api.ts';
import { putById } from '../../lib/list.ts';
import { useIssueMutation, useOptimisticMutation } from '../../lib/mutation.ts';

/** カレンダーの ics 配信 URL（[docs/features/calendar-feeds.md](../../../docs/features/calendar-feeds.md)） */
export type CalendarFeed = ApiOutputs['calendarFeeds']['list'][number];

export const calendarFeedsQueryOptions = queryOptions({
  queryKey: ['calendar-feeds'],
  queryFn: ({ signal }) => api.calendarFeeds.list.query(undefined, { signal }),
});

/** 発行。URL を見られるのは発行の応答だけ（`useIssueMutation`） */
export function useCreateCalendarFeed() {
  return useIssueMutation({
    request: api.calendarFeeds.create.mutate,
    queryKey: calendarFeedsQueryOptions.queryKey,
  });
}

/**
 * 名前と参加者の変更。発行・失効と揃えてオフラインでは溜めない。
 * 「もうこの URL からは相手の予定が見えない」ことを確かめたい操作なので、
 * 送れたかどうかが分からないまま変わって見えるのは困る。
 */
export function useUpdateCalendarFeed() {
  return useOptimisticMutation({
    request: write.calendarFeeds.update,
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
    request: (id: string) => write.calendarFeeds.revoke({ id }),
    queue: false,
    keys: [calendarFeedsQueryOptions.queryKey],
    apply: (client, id) => {
      client.setQueryData(
        calendarFeedsQueryOptions.queryKey,
        (feeds) => feeds && putById(feeds, id, null),
      );
    },
  });
}
