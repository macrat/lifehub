import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CalendarFeedInput } from '../../../shared/validation/calendar-feeds.ts';
import { type ApiOutputs, api, write } from '../../lib/api.ts';
import { putById } from '../../lib/list.ts';
import { useOptimisticMutation } from '../../lib/mutation.ts';

/** カレンダーの ics 配信 URL（[docs/features/calendar-feeds.md](../../../docs/features/calendar-feeds.md)） */
export type CalendarFeed = ApiOutputs['calendarFeeds']['list'][number];

/** 発行した直後の配信 URL。URL そのものを見られるのはこのときだけ */
export type IssuedCalendarFeed = ApiOutputs['calendarFeeds']['create'];

export const calendarFeedsQueryOptions = queryOptions({
  queryKey: ['calendar-feeds'],
  queryFn: ({ signal }) => api.calendarFeeds.list.query(undefined, { signal }),
});

/**
 * 発行。発行した URL を画面に出すために応答の本文が要るので、書き込みの共通の mutation
 * （`useOptimisticMutation`。応答を返さない）ではなく、応答を待って返す mutation にする（API キーと同じ）。
 * オフラインでは溜めずにその場で失敗する（URL はサーバーが作るので、送れるまで出せるものが無い）。
 * 応答には一覧に出す項目がすべて載っているので、一覧は取り直さずに末尾（作成日時の昇順）へ足す。
 * URL そのものは一覧に入れない（キャッシュは端末の IndexedDB に残るので、秘密を置かない）。
 */
export function useCreateCalendarFeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CalendarFeedInput): Promise<IssuedCalendarFeed> =>
      api.calendarFeeds.create.mutate(input),
    networkMode: 'always',
    onSuccess: ({ url: _url, ...feed }) => {
      queryClient.setQueryData(
        calendarFeedsQueryOptions.queryKey,
        (feeds) => feeds && putById(feeds, feed.id, feed),
      );
    },
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
