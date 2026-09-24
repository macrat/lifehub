import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import { useQuery } from '@tanstack/react-query';
import { formatDateTime } from '../../../lib/date.ts';
import { copyToClipboard } from '../../../lib/ui/clipboard.ts';
import { QueryView } from '../../../lib/ui/QueryView.tsx';
import { useOpenWith, useToggle } from '../../../lib/ui/use-toggle.ts';
import { useUserLabels } from '../../users/use-user-labels.ts';
import {
  type CalendarFeed,
  calendarFeedsQueryOptions,
  useCreateCalendarFeed,
  useRevokeCalendarFeed,
  useUpdateCalendarFeed,
} from '../queries.ts';
import { CalendarFeedForm } from './CalendarFeedForm.tsx';

/**
 * 設定画面の「外部連携」の配信 URL の行。予定を他のカレンダーアプリで購読するための URL を
 * 何本でも発行し、渡した先ごとに参加者を選んで失効させる（[docs/features/calendar-feeds.md](../../../../docs/features/calendar-feeds.md)）。
 */
export function CalendarFeedList() {
  const feedsQuery = useQuery(calendarFeedsQueryOptions);
  const createFeed = useCreateCalendarFeed();
  const updateFeed = useUpdateCalendarFeed();
  const revokeFeed = useRevokeCalendarFeed();
  const { users } = useUserLabels();
  // 発行と編集は別の状態にする（ユーザーの管理画面と同じ持ち方）
  const creating = useToggle();
  const editing = useOpenWith<CalendarFeed>();
  const editingFeed = editing.value;

  return (
    <>
      <ListItem>
        <ListItemText primary="ics の配信 URL" />
      </ListItem>
      <QueryView query={feedsQuery} skeleton={<FeedSkeleton />}>
        {(feeds) =>
          feeds.map((feed) => (
            <FeedItem
              key={feed.id}
              feed={feed}
              // 並びはユーザーの一覧に合わせる（保存の順ではなく、画面のどこでも同じ順で出す）
              participants={users
                .filter((user) => feed.participantIds.includes(user.id))
                .map((user) => user.name)
                .join('・')}
              onEdit={() => editing.open(feed)}
              onRevoke={() => revokeFeed.mutate(feed.id)}
            />
          ))
        }
      </QueryView>
      <ListItem>
        <Button startIcon={<AddIcon />} onClick={creating.on}>
          配信 URL を発行
        </Button>
      </ListItem>
      {creating.value && (
        <CalendarFeedForm onClose={creating.off} onSubmit={createFeed.mutateAsync} />
      )}
      {editingFeed && (
        <CalendarFeedForm
          feed={editingFeed}
          onClose={editing.close}
          onSubmit={(input) => updateFeed.mutateAsync({ ...input, id: editingFeed.id })}
        />
      )}
    </>
  );
}

/** 1 本の配信 URL。コピー・編集・失効をその場で行う（URL は長いので字面は出さない） */
function FeedItem({
  feed,
  participants,
  onEdit,
  onRevoke,
}: {
  feed: CalendarFeed;
  /** 表示する対象者の名前（中黒つなぎ） */
  participants: string;
  onEdit: () => void;
  onRevoke: () => void;
}) {
  const read = feed.lastAccessedAt
    ? `最後に読まれたのは ${formatDateTime(feed.lastAccessedAt)}`
    : 'まだ一度も読まれていません';

  return (
    <ListItem
      secondaryAction={
        <Stack direction="row">
          <IconButton
            aria-label={`${feed.name} の URL をコピー`}
            onClick={() => copyToClipboard(feed.url, '配信 URL をコピーしました')}
          >
            <ContentCopyIcon />
          </IconButton>
          <IconButton aria-label={`${feed.name} を編集`} onClick={onEdit}>
            <EditIcon />
          </IconButton>
          <IconButton
            edge="end"
            aria-label={`${feed.name} を失効`}
            onClick={() => {
              if (window.confirm(`「${feed.name}」を失効しますか？この URL では読めなくなります。`))
                onRevoke();
            }}
          >
            <DeleteIcon />
          </IconButton>
        </Stack>
      }
    >
      <ListItemText
        // secondaryAction の既定の余白ではボタン 3 つと説明文が重なる
        sx={{ pr: 15 }}
        primary={feed.name}
        secondary={participants ? `${participants} の予定・${read}` : read}
      />
    </ListItem>
  );
}

function FeedSkeleton() {
  return (
    <ListItem>
      <ListItemText primary={<Skeleton width="40%" />} secondary={<Skeleton width="60%" />} />
    </ListItem>
  );
}
