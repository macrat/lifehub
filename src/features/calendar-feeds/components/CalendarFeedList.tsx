import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import { formatDateTime } from '../../../lib/date.ts';
import { IssuedSecretDialog } from '../../../lib/ui/IssuedSecretDialog.tsx';
import { ListItemSkeleton, QueryView } from '../../../lib/ui/QueryView.tsx';
import type { CalendarFeed } from '../queries.ts';
import { useCalendarFeedList } from '../use-calendar-feed-list.ts';
import { CalendarFeedForm } from './CalendarFeedForm.tsx';

/**
 * 設定画面の「外部連携」の配信 URL の行。予定を他のカレンダーアプリで購読するための URL を
 * 何本でも発行し、渡した先ごとに参加者を選んで失効させる（[docs/features/calendar-feeds.md](../../../../docs/features/calendar-feeds.md)）。
 */
export function CalendarFeedList() {
  const list = useCalendarFeedList();

  return (
    <>
      <ListItem>
        <ListItemText primary="ics の配信 URL" />
      </ListItem>
      <QueryView query={list.feedsQuery} skeleton={<ListItemSkeleton />}>
        {(feeds) =>
          feeds.map((feed) => (
            <FeedItem
              key={feed.id}
              feed={feed}
              participants={list.participantsOf(feed)}
              onEdit={() => list.startEdit(feed)}
              onRevoke={() => list.revoke(feed)}
            />
          ))
        }
      </QueryView>
      <ListItem>
        <Button startIcon={<AddIcon />} onClick={list.startCreate}>
          配信 URL を発行
        </Button>
      </ListItem>
      {list.createForm && <CalendarFeedForm {...list.createForm} />}
      {list.editForm && <CalendarFeedForm {...list.editForm} />}
      {list.issued && (
        <IssuedSecretDialog
          label="発行した配信 URL"
          copy="配信 URL をコピー"
          copied="配信 URL をコピーしました"
          issued={list.issued}
          onClose={list.closeIssued}
        />
      )}
    </>
  );
}

/** 1 本の配信 URL。編集・失効をその場で行う（失効は確かめてから送る。URL は保存していないので出せない） */
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
          <IconButton aria-label={`${feed.name} を編集`} onClick={onEdit}>
            <EditIcon />
          </IconButton>
          <IconButton edge="end" aria-label={`${feed.name} を失効`} onClick={onRevoke}>
            <DeleteIcon />
          </IconButton>
        </Stack>
      }
    >
      <ListItemText
        // secondaryAction の既定の余白ではボタン 2 つと説明文が重なる
        sx={{ pr: 10 }}
        primary={feed.name}
        secondary={participants ? `${participants} の予定・${read}` : read}
      />
    </ListItem>
  );
}
