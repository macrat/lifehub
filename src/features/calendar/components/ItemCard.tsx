import RepeatIcon from '@mui/icons-material/Repeat';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { formatDate, formatTime, toDateString } from '../../../lib/date.ts';
import { useOnline } from '../../../lib/online.ts';
import { useToggleTaskCompletion } from '../../tasks/queries.ts';
import { useOwnerLabel } from '../../users/use-owner-label.ts';
import type { CalendarEventItem, CalendarItem, CalendarTaskItem } from '../queries.ts';

type Props = {
  item: CalendarItem;
  onClick: (item: CalendarItem) => void;
};

/**
 * 一覧（日別リスト・週表示・イベント画面・ホーム）に並ぶカード。
 * 左に時刻の列（折り返さない）、右にタイトルとメタ情報の 2 行。狭い幅でも同じ形を保つ。
 * 予定は実線、タスクは破線で見分け、タスクは完了チェックを持つ。期限超過は赤、完了は薄く取り消し線。
 */
export function ItemCard({ item, onClick }: Props) {
  const { label } = useOwnerLabel();
  const toggle = useToggleTaskCompletion();
  const online = useOnline();
  const isTask = item.kind === 'task';
  const completed = isTask && item.completedAt !== null;
  const overdue = isTask && item.isOverdue;
  const time = isTask ? taskTimeLabel(item) : eventTimeLabel(item);

  return (
    <Card
      variant="outlined"
      sx={{
        borderColor: overdue ? 'error.main' : undefined,
        borderStyle: isTask ? 'dashed' : 'solid',
        opacity: completed ? 0.6 : 1,
      }}
    >
      <Stack direction="row" sx={{ alignItems: 'stretch' }}>
        {isTask && (
          <Checkbox
            checked={completed}
            disabled={toggle.isPending || !online}
            onChange={(_, checked) =>
              toggle.mutate({ id: item.id, occurrenceKey: item.occurrenceKey, completed: checked })
            }
            slotProps={{
              input: {
                'aria-label': `${item.title} を${completed ? '未完了に戻す' : '完了にする'}`,
              },
            }}
            sx={{ alignSelf: 'center', ml: 0.5 }}
          />
        )}
        <CardActionArea onClick={() => onClick(item)} sx={{ px: 1.5, py: 1 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Box sx={{ width: 76, flexShrink: 0 }}>
              {time.caption && (
                <Typography
                  variant="caption"
                  component="div"
                  color={overdue ? 'error' : 'text.secondary'}
                  sx={{ lineHeight: 1.2 }}
                >
                  {time.caption}
                </Typography>
              )}
              <Typography
                variant="body2"
                component="div"
                color={overdue ? 'error' : 'primary'}
                sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', lineHeight: 1.3 }}
              >
                {time.main}
              </Typography>
              {time.sub && (
                <Typography
                  variant="caption"
                  component="div"
                  color={overdue ? 'error' : 'text.secondary'}
                  sx={{ lineHeight: 1.2 }}
                >
                  {time.sub}
                </Typography>
              )}
            </Box>
            <Stack sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography
                sx={{
                  overflowWrap: 'anywhere',
                  textDecoration: completed ? 'line-through' : 'none',
                }}
              >
                {item.title}
              </Typography>
              <Stack
                direction="row"
                spacing={0.75}
                sx={{ alignItems: 'center', mt: 0.25, minWidth: 0 }}
              >
                <Chip
                  size="small"
                  label={label(item.kind === 'event' ? item.ownerUserId : item.assigneeUserId)}
                  variant="outlined"
                  sx={{ height: 20, fontSize: '0.7rem' }}
                />
                {item.isRecurring && (
                  <RepeatIcon sx={{ fontSize: 16 }} color="action" titleAccess="繰り返し" />
                )}
                {item.kind === 'event' && item.location && (
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {item.location}
                  </Typography>
                )}
              </Stack>
            </Stack>
          </Stack>
        </CardActionArea>
      </Stack>
    </Card>
  );
}

type TimeLabel = { caption?: string; main: string; sub?: string };

function eventTimeLabel(item: CalendarEventItem): TimeLabel {
  if (item.allDay) return { main: '終日' };
  if (item.dayCount > 1) return { main: `${item.dayIndex}/${item.dayCount}日目` };
  return { main: formatTime(item.startsAt), sub: `〜${formatTime(item.endsAt)}` };
}

/**
 * タスクは「完了 → 期限 → 開始」の優先で示す。日付が表示位置の日と違う（繰り越し・期限が別日）ときは日付も付ける。
 */
function taskTimeLabel(item: CalendarTaskItem): TimeLabel {
  const withDate = (iso: string): Pick<TimeLabel, 'main' | 'sub'> => {
    const sameDay = toDateString(new Date(iso)) === item.placementDate;
    return sameDay ? { main: formatTime(iso) } : { main: formatDate(iso), sub: formatTime(iso) };
  };
  if (item.completedAt) return { caption: '完了', ...withDate(item.completedAt) };
  if (item.dueAt) return { caption: '期限', ...withDate(item.dueAt) };
  if (item.startsAt) return { caption: '開始', ...withDate(item.startsAt) };
  return { main: 'タスク' };
}
