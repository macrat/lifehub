import RepeatIcon from '@mui/icons-material/Repeat';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { formatDateTime, formatTime, toDateString } from '../../../lib/date.ts';
import { useToggleTaskCompletion } from '../../tasks/queries.ts';
import { useOwnerLabel } from '../../users/use-owner-label.ts';
import type { CalendarItem, CalendarTaskItem } from '../queries.ts';

type Props = {
  item: CalendarItem;
  onClick: (item: CalendarItem) => void;
};

/** 一覧（日別リスト・週表示・イベント画面・ホーム）に並ぶカード。予定は時間帯、タスクは完了チェックを持つ。 */
export function ItemCard({ item, onClick }: Props) {
  const { label } = useOwnerLabel();
  const toggle = useToggleTaskCompletion();
  const isTask = item.kind === 'task';
  const completed = isTask && item.completedAt !== null;
  const overdue = isTask && item.isOverdue;

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
            disabled={toggle.isPending}
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
          <Stack
            direction="row"
            spacing={1.5}
            sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}
          >
            <Typography
              variant="body2"
              color={overdue ? 'error' : 'primary'}
              sx={{ minWidth: 72, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
            >
              {isTask ? taskTimeLabel(item) : eventTimeLabel(item)}
            </Typography>
            <Stack sx={{ flexGrow: 1, flexBasis: 120, minWidth: 0 }}>
              <Typography
                sx={{
                  overflowWrap: 'anywhere',
                  textDecoration: completed ? 'line-through' : 'none',
                }}
              >
                {item.title}
              </Typography>
              {item.kind === 'event' && item.location && (
                <Typography variant="caption" color="text.secondary" noWrap>
                  {item.location}
                </Typography>
              )}
            </Stack>
            {item.isRecurring && <RepeatIcon fontSize="small" color="action" />}
            <Chip
              size="small"
              label={label(item.kind === 'event' ? item.ownerUserId : item.assigneeUserId)}
              variant="outlined"
            />
          </Stack>
        </CardActionArea>
      </Stack>
    </Card>
  );
}

function eventTimeLabel(item: Extract<CalendarItem, { kind: 'event' }>): string {
  if (item.allDay) return '終日';
  if (item.dayCount > 1) return `${item.dayIndex}/${item.dayCount}日目`;
  return `${formatTime(item.startsAt)}〜${formatTime(item.endsAt)}`;
}

/** タスクは「期限」を優先して示す。期限が別の日なら日付も付ける。 */
function taskTimeLabel(item: CalendarTaskItem): string {
  if (item.dueAt) {
    const sameDay = toDateString(new Date(item.dueAt)) === item.placementDate;
    return `期限 ${sameDay ? formatTime(item.dueAt) : formatDateTime(item.dueAt)}`;
  }
  if (item.startsAt) return formatTime(item.startsAt);
  return 'タスク';
}
