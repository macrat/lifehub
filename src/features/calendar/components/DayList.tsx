import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { DateString } from '../../../../shared/types.ts';
import { formatDate, isToday } from '../../../lib/date.ts';
import type { CalendarItem } from '../queries.ts';
import { ItemCard } from './ItemCard.tsx';
import { itemKey } from './MonthGrid.tsx';

type Props = {
  date: DateString;
  items: CalendarItem[];
  onSelectItem: (item: CalendarItem) => void;
  emptyText?: string;
  /** 項目が無い日を 1 行にまとめる（週表示など、空の日が多い場面向け） */
  compactEmpty?: boolean;
};

/** 1 日分の見出しと行の一覧（Google カレンダーの予定リストの体裁） */
export function DayList({
  date,
  items,
  onSelectItem,
  emptyText = '予定なし',
  compactEmpty = false,
}: Props) {
  const today = isToday(date);
  if (compactEmpty && items.length === 0) {
    return (
      <Typography
        variant="caption"
        component="h3"
        sx={{ px: 2, py: 0.75, fontWeight: 600, color: today ? 'primary.main' : 'text.secondary' }}
      >
        {formatDate(date)}
        {today && ' 今日'}
        <Typography variant="caption" color="text.disabled" sx={{ ml: 1, fontWeight: 400 }}>
          {emptyText}
        </Typography>
      </Typography>
    );
  }
  return (
    <Box>
      <Typography
        variant="caption"
        component="h3"
        sx={{
          px: 2,
          pt: 1,
          pb: 0.25,
          fontWeight: 600,
          color: today ? 'primary.main' : 'text.secondary',
        }}
      >
        {formatDate(date)}
        {today && ' 今日'}
      </Typography>
      {items.length === 0 ? (
        <Typography variant="body2" color="text.disabled" sx={{ px: 2, pb: 1 }}>
          {emptyText}
        </Typography>
      ) : (
        items.map((item) => <ItemCard key={itemKey(item)} item={item} onClick={onSelectItem} />)
      )}
    </Box>
  );
}
