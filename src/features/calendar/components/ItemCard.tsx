import RepeatIcon from '@mui/icons-material/Repeat';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Checkbox from '@mui/material/Checkbox';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { formatDate, formatTime, toDateString } from '../../../lib/date.ts';
import { useOnline } from '../../../lib/online.ts';
import { useToggleTaskCompletion } from '../../tasks/queries.ts';
import { useOwnerLabel } from '../../users/use-owner-label.ts';
import { useUserColor } from '../../users/use-user-color.ts';
import {
  type CalendarEventItem,
  type CalendarItem,
  type CalendarTaskItem,
  ownerOf,
  taskTime,
} from '../queries.ts';

type Props = {
  item: CalendarItem;
  onClick: (item: CalendarItem) => void;
};

/**
 * 一覧（リスト表示・ホーム）の 1 行。Google カレンダー／ToDo の行に倣い、枠線を持たない。
 * 左に時刻の列（折り返さない）、右にタイトルとメタ情報。予定は色の点、タスクはチェックボックスで見分け、色は所有者・担当者のユーザーの色。
 * 期限超過は赤、完了は薄く取り消し線。
 */
export function ItemCard({ item, onClick }: Props) {
  const { label } = useOwnerLabel();
  const colorFor = useUserColor();
  const toggle = useToggleTaskCompletion();
  const online = useOnline();
  const isTask = item.kind === 'task';
  const completed = isTask && item.completedAt !== null;
  const overdue = isTask && item.isOverdue;
  const time = isTask ? taskTimeLabel(item) : eventTimeLabel(item);
  const ownerId = ownerOf(item);
  const owner = label(ownerId);
  const colors = colorFor(ownerId);
  const meta = [owner, item.kind === 'event' ? item.location : null].filter(Boolean).join(' · ');

  return (
    <Stack direction="row" sx={{ alignItems: 'stretch', opacity: completed ? 0.55 : 1 }}>
      <Box
        sx={{
          width: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {isTask ? (
          <Checkbox
            size="small"
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
            sx={{ p: 0.5, color: colors.fill, '&.Mui-checked': { color: colors.fill } }}
          />
        ) : (
          <Box
            sx={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              bgcolor: colors.fill,
            }}
          />
        )}
      </Box>
      <ButtonBase
        onClick={() => onClick(item)}
        sx={{
          flexGrow: 1,
          minWidth: 0,
          justifyContent: 'flex-start',
          textAlign: 'left',
          py: 0.75,
          pr: 2,
          gap: 1.5,
          borderRadius: 1,
        }}
      >
        <Box sx={{ width: 64, flexShrink: 0 }}>
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
            color={overdue ? 'error' : 'text.primary'}
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
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography
            sx={{ overflowWrap: 'anywhere', textDecoration: completed ? 'line-through' : 'none' }}
          >
            {item.title}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            component="div"
            noWrap
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
          >
            {meta}
            {item.isRecurring && <RepeatIcon sx={{ fontSize: 14 }} titleAccess="繰り返し" />}
          </Typography>
        </Box>
      </ButtonBase>
    </Stack>
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
  const time = taskTime(item);
  if (!time) return { main: '' };
  return { caption: time.kind === 'due' ? '期限' : '開始', ...withDate(time.at) };
}
