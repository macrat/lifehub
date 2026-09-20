import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { DateString } from '../../../../shared/types.ts';
import { isToday, monthGridDays, WEEKDAY_LABELS } from '../../../lib/date.ts';
import type { CalendarItem } from '../queries.ts';
import { ItemChip } from './ItemChip.tsx';

const MAX_CHIPS = 3;

type Props = {
  month: string;
  itemsByDate: Map<DateString, CalendarItem[]>;
  selectedDate: DateString;
  onSelectDate: (date: DateString) => void;
  onSelectItem: (item: CalendarItem) => void;
};

/** 月グリッド（月曜始まり・6 週）。セルをタップすると日付を選択し、下の一覧に反映される。 */
export function MonthGrid({ month, itemsByDate, selectedDate, onSelectDate, onSelectItem }: Props) {
  const days = monthGridDays(month);
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        overflow: 'hidden',
      }}
    >
      {WEEKDAY_LABELS.map((label, i) => (
        <Typography
          key={label}
          variant="caption"
          align="center"
          sx={{
            py: 0.5,
            bgcolor: 'action.hover',
            color: i === 5 ? 'info.main' : i === 6 ? 'error.main' : 'text.secondary',
          }}
        >
          {label}
        </Typography>
      ))}
      {days.map((date, index) => {
        const items = itemsByDate.get(date) ?? [];
        const inMonth = date.startsWith(month);
        const selected = date === selectedDate;
        const weekday = index % 7;
        return (
          <Box
            key={date}
            role="button"
            tabIndex={0}
            aria-label={date}
            aria-pressed={selected}
            onClick={() => onSelectDate(date)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelectDate(date);
            }}
            sx={{
              minHeight: { xs: 64, md: 96 },
              p: 0.25,
              borderTop: 1,
              borderLeft: weekday === 0 ? 0 : 1,
              borderColor: 'divider',
              bgcolor: selected ? 'action.selected' : 'transparent',
              opacity: inMonth ? 1 : 0.45,
              cursor: 'pointer',
              overflow: 'hidden',
            }}
          >
            <Typography
              variant="caption"
              component="div"
              sx={{
                width: 22,
                height: 22,
                lineHeight: '22px',
                textAlign: 'center',
                borderRadius: '50%',
                bgcolor: isToday(date) ? 'primary.main' : 'transparent',
                color: isToday(date)
                  ? 'primary.contrastText'
                  : weekday === 5
                    ? 'info.main'
                    : weekday === 6
                      ? 'error.main'
                      : 'text.primary',
              }}
            >
              {Number(date.slice(8))}
            </Typography>
            <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
              {items.slice(0, MAX_CHIPS).map((item) => (
                <ItemChip key={itemKey(item)} item={item} onClick={onSelectItem} />
              ))}
              {items.length > MAX_CHIPS && (
                <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>
                  +{items.length - MAX_CHIPS}
                </Typography>
              )}
            </Box>
            <Box sx={{ display: { xs: 'flex', sm: 'none' }, gap: 0.25, flexWrap: 'wrap', px: 0.5 }}>
              {items.slice(0, 4).map((item) => (
                <Box
                  key={itemKey(item)}
                  sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'primary.main' }}
                />
              ))}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

export function itemKey(item: CalendarItem): string {
  const occurrence = item.kind === 'event' ? item.occurrenceStart : item.occurrenceKey;
  return `${item.kind}:${item.id}:${occurrence}:${item.placementDate}`;
}
