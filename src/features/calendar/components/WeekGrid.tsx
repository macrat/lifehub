import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import type { DateString } from '../../../../shared/types.ts';
import { weekDays } from '../../../lib/date.ts';
import type { CalendarItem } from '../queries.ts';
import { DayList } from './DayList.tsx';

type Props = {
  date: DateString;
  itemsByDate: Map<DateString, CalendarItem[]>;
  onSelectItem: (item: CalendarItem) => void;
};

/** 週表示。広い画面では 7 列、それ以外は縦に 7 日を並べる。 */
export function WeekGrid({ date, itemsByDate, onSelectItem }: Props) {
  const days = weekDays(date);
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', xl: 'repeat(7, minmax(0, 1fr))' },
        gap: { xs: 0, xl: 2 },
      }}
    >
      {days.map((day) => (
        <Stack key={day}>
          <DayList
            date={day}
            items={itemsByDate.get(day) ?? []}
            onSelectItem={onSelectItem}
            compactEmpty
          />
        </Stack>
      ))}
    </Box>
  );
}
