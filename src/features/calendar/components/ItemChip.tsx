import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { formatTime } from '../../../lib/date.ts';
import type { CalendarItem } from '../queries.ts';

type Props = {
  item: CalendarItem;
  onClick: (item: CalendarItem) => void;
};

/** 月グリッドのセル内に並ぶ 1 行表示。予定は塗り、タスクは枠線で見分ける（タスクは M3 で追加）。 */
export function ItemChip({ item, onClick }: Props) {
  const time = item.allDay ? null : formatTime(item.startsAt);
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
        bgcolor: item.allDay ? 'primary.main' : 'transparent',
        color: item.allDay ? 'primary.contrastText' : 'text.primary',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        fontSize: '0.72rem',
        lineHeight: 1.6,
        '&:hover': { bgcolor: item.allDay ? 'primary.dark' : 'action.hover' },
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
