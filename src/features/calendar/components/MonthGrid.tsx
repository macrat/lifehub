import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { DateString } from '../../../../shared/types.ts';
import { isToday, monthGridDays, WEEKDAY_LABELS } from '../../../lib/date.ts';
import type { CalendarItem } from '../queries.ts';
import { ItemChip } from './ItemChip.tsx';

type Props = {
  month: string;
  itemsByDate: Map<DateString, CalendarItem[]>;
  selectedDate: DateString;
  onSelectDate: (date: DateString) => void;
  onSelectItem: (item: CalendarItem) => void;
  /** グリッド全体の高さ（例: 画面の残り全部）。省略時は内容に合わせる */
  height?: string;
};

/**
 * 月グリッド（月曜始まり・6 週）。高さが与えられれば 6 行で等分し、セルに入るだけ項目を並べる
 * （溢れた分は「+n」）。セルをタップすると日付を選択し、下の一覧に反映される。
 */
export function MonthGrid({
  month,
  itemsByDate,
  selectedDate,
  onSelectDate,
  onSelectItem,
  height,
}: Props) {
  const days = monthGridDays(month);
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
        gridTemplateRows: height ? 'auto repeat(6, minmax(0, 1fr))' : undefined,
        height,
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
            py: 0.25,
            lineHeight: 1.4,
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
              minHeight: height ? 0 : { xs: 64, md: 96 },
              display: 'flex',
              flexDirection: 'column',
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
                width: 20,
                height: 20,
                lineHeight: '20px',
                textAlign: 'center',
                borderRadius: '50%',
                flexShrink: 0,
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
            <CellItems items={items} onSelectItem={onSelectItem} />
          </Box>
        );
      })}
    </Box>
  );
}

/** セル内の項目。入るだけ並べ、溢れた分は「+n」で示す（行の高さから入る数を CSS で決める） */
function CellItems({
  items,
  onSelectItem,
}: {
  items: CalendarItem[];
  onSelectItem: (item: CalendarItem) => void;
}) {
  const MAX = 4;
  const shown = items.slice(0, MAX);
  const rest = items.length - shown.length;
  return (
    <Box
      sx={{
        minHeight: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: '1px',
      }}
    >
      {shown.map((item) => (
        <ItemChip key={itemKey(item)} item={item} onClick={onSelectItem} />
      ))}
      {rest > 0 && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ px: 0.5, lineHeight: 1.4, fontSize: '0.65rem' }}
        >
          +{rest}
        </Typography>
      )}
    </Box>
  );
}

export function itemKey(item: CalendarItem): string {
  const occurrence = item.kind === 'event' ? item.occurrenceStart : item.occurrenceKey;
  return `${item.kind}:${item.id}:${occurrence}:${item.placementDate}`;
}
