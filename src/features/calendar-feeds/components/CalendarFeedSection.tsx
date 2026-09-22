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
import { useState } from 'react';
import { formatDateTime } from '../../../lib/date.ts';
import { notify } from '../../../lib/ui/notice.ts';
import { QueryView } from '../../../lib/ui/QueryView.tsx';
import { SettingsSection } from '../../../lib/ui/SettingsSection.tsx';
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
 * 設定画面の「カレンダーの配信」。予定を他のカレンダーアプリで購読するための URL を
 * 何本でも発行し、渡した先ごとに参加者を選んで失効させる（[docs/features/calendar-feeds.md](../../../../docs/features/calendar-feeds.md)）。
 */
export function CalendarFeedSection() {
  const feedsQuery = useQuery(calendarFeedsQueryOptions);
  const createFeed = useCreateCalendarFeed();
  const updateFeed = useUpdateCalendarFeed();
  const revokeFeed = useRevokeCalendarFeed();
  /** 出しているフォーム。発行は feed を持たない（`null` は閉じている） */
  const [editing, setEditing] = useState<{ feed?: CalendarFeed } | null>(null);

  return (
    <SettingsSection title="カレンダーの配信">
      <ListItem>
        <ListItemText
          primary="ics の配信 URL"
          secondary="予定を他のカレンダーアプリで購読するための URL。URL を知っていれば誰でも読めるので、渡す先ごとに発行して、要らなくなったら失効させます。選んだ参加者が入っている予定だけを配ります。タスクは配信しません。"
        />
      </ListItem>
      <QueryView query={feedsQuery} skeleton={<FeedSkeleton />}>
        {(feeds) =>
          feeds.map((feed) => (
            <FeedItem
              key={feed.id}
              feed={feed}
              onEdit={() => setEditing({ feed })}
              onRevoke={() => revokeFeed.mutate(feed.id)}
            />
          ))
        }
      </QueryView>
      <ListItem>
        <Button startIcon={<AddIcon />} onClick={() => setEditing({})}>
          配信 URL を発行
        </Button>
      </ListItem>
      {editing && (
        <CalendarFeedForm
          feed={editing.feed}
          onClose={() => setEditing(null)}
          onSubmit={(input) => {
            const feed = editing.feed;
            return feed
              ? updateFeed.mutateAsync({ ...input, id: feed.id })
              : createFeed.mutateAsync(input);
          }}
        />
      )}
    </SettingsSection>
  );
}

/** 1 本の配信 URL。コピー・編集・失効をその場で行う（URL は長いので字面は出さない） */
function FeedItem({
  feed,
  onEdit,
  onRevoke,
}: {
  feed: CalendarFeed;
  onEdit: () => void;
  onRevoke: () => void;
}) {
  const { users } = useUserLabels();
  // 並びはユーザーの一覧に合わせる（保存の順ではなく、画面のどこでも同じ順で出す）
  const participants = users
    .filter((user) => feed.participantIds.includes(user.id))
    .map((user) => user.name)
    .join('・');
  const read = feed.lastAccessedAt
    ? `最後に読まれたのは ${formatDateTime(feed.lastAccessedAt)}`
    : 'まだ一度も読まれていません';

  return (
    <ListItem
      secondaryAction={
        <Stack direction="row">
          <IconButton aria-label={`${feed.name} の URL をコピー`} onClick={() => copy(feed.url)}>
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

async function copy(url: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(url);
    notify('配信 URL をコピーしました');
  } catch {
    notify('コピーできませんでした');
  }
}
