import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import IconButton from '@mui/material/IconButton';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';

export type CalendarView = 'month' | 'week';

type Props = {
  title: string;
  view: CalendarView;
  onChangeView: (view: CalendarView) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
};

/** AppBar に収めるカレンダーの操作。色は AppBar から継承する。 */
export function CalendarToolbar({ title, view, onChangeView, onPrev, onNext, onToday }: Props) {
  return (
    <>
      <IconButton color="inherit" aria-label="前へ" onClick={onPrev} size="small" edge="start">
        <ChevronLeftIcon />
      </IconButton>
      <Typography
        variant="subtitle1"
        component="h2"
        sx={{ minWidth: 0, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
      >
        {title}
      </Typography>
      <IconButton color="inherit" aria-label="次へ" onClick={onNext} size="small">
        <ChevronRightIcon />
      </IconButton>
      <IconButton color="inherit" aria-label="今日" onClick={onToday} size="small">
        <TodayIcon />
      </IconButton>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={view}
        onChange={(_, v: CalendarView | null) => v && onChangeView(v)}
        sx={{
          ml: 'auto',
          '& .MuiToggleButton-root': {
            color: 'inherit',
            borderColor: 'rgba(255,255,255,.5)',
            px: 1,
            py: 0.25,
            '&.Mui-selected': { color: 'inherit', bgcolor: 'rgba(255,255,255,.25)' },
          },
        }}
      >
        <ToggleButton value="month" aria-label="月表示">
          月
        </ToggleButton>
        <ToggleButton value="week" aria-label="週表示">
          週
        </ToggleButton>
      </ToggleButtonGroup>
    </>
  );
}
