import Stack from '@mui/material/Stack';
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
};

/** 1 日分の見出しとカード一覧 */
export function DayList({ date, items, onSelectItem, emptyText = 'なし' }: Props) {
  return (
    <Stack spacing={1}>
      <Typography
        variant="subtitle2"
        component="h3"
        color={isToday(date) ? 'primary' : 'text.secondary'}
      >
        {formatDate(date)}
        {isToday(date) && '（今日）'}
      </Typography>
      {items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {emptyText}
        </Typography>
      ) : (
        items.map((item) => <ItemCard key={itemKey(item)} item={item} onClick={onSelectItem} />)
      )}
    </Stack>
  );
}
