import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { DayList } from '../../calendar/components/DayList.tsx';
import { ItemDialogs } from '../../calendar/components/ItemDialogs.tsx';
import { type CalendarItem, groupByDate } from '../../calendar/queries.ts';
import type { DashboardCardOf } from '../queries.ts';
import { SectionHeading } from './DashboardCardFrame.tsx';

/** 次の予定。カレンダーの一覧と同じ行の部品で、日付ごとにまとめて表示する。 */
export function UpcomingEventsCard({ card }: { card: DashboardCardOf<'events-upcoming'> }) {
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const navigate = useNavigate();
  const grouped = groupByDate(card.data);
  return (
    <Box component="section" sx={{ py: 1 }}>
      <SectionHeading title="次の予定" onClick={() => navigate({ to: '/calendar' })} />
      {grouped.size === 0 ? (
        <Typography variant="body2" color="text.disabled" sx={{ px: 2 }}>
          なし
        </Typography>
      ) : (
        [...grouped.entries()].map(([date, items]) => (
          <DayList key={date} date={date} items={items} onSelectItem={setSelected} />
        ))
      )}
      <ItemDialogs item={selected} onClose={() => setSelected(null)} />
    </Box>
  );
}
