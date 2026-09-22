import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { DateString } from '../../../../shared/types.ts';
import { formatDate, isToday } from '../../../lib/date.ts';
import type { CalendarItem } from '../queries.ts';
import { ItemCard } from './ItemCard.tsx';
import { itemKey } from './lane-layout.ts';

type Props = {
  date: DateString;
  items: CalendarItem[];
  /** 行を押したとき。editing は長押し（編集で開く）か */
  onSelectItem: (item: CalendarItem, editing: boolean) => void;
};

/** 1 日分の見出しと行の一覧（Google カレンダーの予定リストの体裁） */
export function DayList({ date, items, onSelectItem }: Props) {
  const today = isToday(date);
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
          予定なし
        </Typography>
      ) : (
        items.map((item) => <ItemCard key={itemKey(item)} item={item} onSelect={onSelectItem} />)
      )}
    </Box>
  );
}
