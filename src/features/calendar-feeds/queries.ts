import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import type { CreateCalendarFeedInput } from '../../../shared/validation/calendar-feeds.ts';
import { api, ensureOk } from '../../lib/api.ts';
import { notify } from '../../lib/ui/notice.ts';

/** カレンダーの ics 配信 URL（[docs/features/calendar-feeds.md](../../../docs/features/calendar-feeds.md)） */
export type CalendarFeed = InferResponseType<typeof api.calendar.feeds.$get>[number];

export const calendarFeedsQueryOptions = queryOptions({
  queryKey: ['calendar-feeds'],
  queryFn: async () => (await ensureOk(await api.calendar.feeds.$get())).json(),
});

/**
 * 発行と失効。他の書き込みと違って楽観的更新（`useOptimisticMutation`）には乗せない。
 * 発行される URL はサーバーが作る乱数なので画面に先出しできず、オフラインで溜めても
 * URL を受け取れないまま待つことになるため（発行も失効も急ぐ操作ではない）。
 */
export function useCreateCalendarFeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCalendarFeedInput) => {
      await ensureOk(await api.calendar.feeds.$post({ json: input }));
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: calendarFeedsQueryOptions.queryKey }),
  });
}

export function useRevokeCalendarFeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await ensureOk(await api.calendar.feeds[':id'].$delete({ param: { id } }));
    },
    // 失効はフォームを持たないので、失敗を出す場所がここしかない（消えたつもりで残るのを防ぐ）
    onError: (error: Error) => notify(error.message),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: calendarFeedsQueryOptions.queryKey }),
  });
}
