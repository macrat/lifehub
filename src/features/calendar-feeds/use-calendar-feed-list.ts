import type { CalendarFeedInput } from '../../../shared/validation/calendar-feeds.ts';
import { useStoreQuery } from '../../lib/screen-data.ts';
import { useOpenWith, useToggle } from '../../lib/ui/use-toggle.ts';
import { useUserLabels } from '../users/use-user-labels.ts';
import {
  type CalendarFeed,
  calendarFeedsQueryOptions,
  useCreateCalendarFeed,
  useRevokeCalendarFeed,
  useUpdateCalendarFeed,
} from './queries.ts';

/**
 * 設定画面の配信 URL の一覧（`CalendarFeedList`）の状態と操作。発行・編集のフォームを開いているか、
 * それぞれの保存先、発行した URL、失効（確かめてから送る）と、行に出す参加者の名前を持つ。
 * 発行と編集は別の状態にする（ユーザーの管理画面と同じ持ち方）。
 * フォームに渡すもの（`createForm` / `editForm`）は、閉じていれば null。
 */
export function useCalendarFeedList() {
  const feedsQuery = useStoreQuery(calendarFeedsQueryOptions);
  const createFeed = useCreateCalendarFeed();
  const updateFeed = useUpdateCalendarFeed();
  const revokeFeed = useRevokeCalendarFeed();
  const { users } = useUserLabels();
  const creating = useToggle();
  const editing = useOpenWith<CalendarFeed>();
  const editingFeed = editing.value;

  return {
    feedsQuery,
    /** 表示する対象者の名前（中黒つなぎ）。並びはユーザーの一覧に合わせる（保存の順ではなく、画面のどこでも同じ順で出す） */
    participantsOf: (feed: CalendarFeed) =>
      users
        .filter((user) => feed.participantIds.includes(user.id))
        .map((user) => user.name)
        .join('・'),
    startCreate: creating.on,
    startEdit: editing.open,
    revoke: (feed: CalendarFeed) => {
      if (!window.confirm(`「${feed.name}」を失効しますか？この URL では読めなくなります。`))
        return;
      revokeFeed.mutate(feed.id);
    },
    createForm: creating.value
      ? {
          onClose: creating.off,
          onSubmit: (input: CalendarFeedInput) => createFeed.issue(input),
        }
      : null,
    editForm: editingFeed
      ? {
          feed: editingFeed,
          onClose: editing.close,
          onSubmit: (input: CalendarFeedInput) =>
            updateFeed.mutateAsync({ ...input, id: editingFeed.id }),
        }
      : null,
    issued: createFeed.issued,
    closeIssued: createFeed.closeIssued,
  };
}
