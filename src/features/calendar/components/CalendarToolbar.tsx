import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
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

export function CalendarToolbar({ title, view, onChangeView, onPrev, onNext, onToday }: Props) {
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ alignItems: 'center', mb: 1.5, flexWrap: 'wrap', rowGap: 1 }}
    >
      <IconButton aria-label="前へ" onClick={onPrev}>
        <ChevronLeftIcon />
      </IconButton>
      <Typography variant="h6" component="h2" sx={{ minWidth: 120, textAlign: 'center' }}>
        {title}
      </Typography>
      <IconButton aria-label="次へ" onClick={onNext}>
        <ChevronRightIcon />
      </IconButton>
      <Button size="small" variant="outlined" onClick={onToday}>
        今日
      </Button>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={view}
        onChange={(_, v: CalendarView | null) => v && onChangeView(v)}
        sx={{ ml: 'auto' }}
      >
        <ToggleButton value="month">月</ToggleButton>
        <ToggleButton value="week">週</ToggleButton>
      </ToggleButtonGroup>
    </Stack>
  );
}
