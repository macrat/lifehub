import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { formatTime } from '../../../lib/date.ts';
import type { CalendarItem } from '../queries.ts';

type Props = {
  item: CalendarItem;
  onClick: (item: CalendarItem) => void;
};

/** 月グリッドのセル内に並ぶ 1 行表示。終日の予定は塗り、タスクは破線の枠で見分ける。 */
export function ItemChip({ item, onClick }: Props) {
  const isTask = item.kind === 'task';
  const filled = item.kind === 'event' && item.allDay;
  const time = item.kind === 'event' ? (item.allDay ? null : formatTime(item.startsAt)) : null;
  const completed = isTask && item.completedAt !== null;
  return (
    <Box
      component="button"
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick(item);
      }}
      sx={{
        all: 'unset',
        boxSizing: 'border-box',
        display: 'block',
        width: '100%',
        cursor: 'pointer',
        px: 0.5,
        borderRadius: 0.5,
        bgcolor: filled ? 'primary.main' : 'transparent',
        color: filled ? 'primary.contrastText' : 'text.primary',
        border: isTask ? 1 : 0,
        borderStyle: 'dashed',
        borderColor: isTask && item.isOverdue ? 'error.main' : 'divider',
        textDecoration: completed ? 'line-through' : 'none',
        opacity: completed ? 0.6 : 1,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        fontSize: '0.72rem',
        lineHeight: 1.6,
        '&:hover': { bgcolor: filled ? 'primary.dark' : 'action.hover' },
      }}
      aria-label={item.title}
    >
      {time && (
        <Typography component="span" sx={{ color: 'primary.main', fontSize: 'inherit', mr: 0.5 }}>
          {time}
        </Typography>
      )}
      {item.title}
    </Box>
  );
}
