import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { ItemCard } from '../../calendar/components/ItemCard.tsx';
import { ItemDialogs } from '../../calendar/components/ItemDialogs.tsx';
import type { CalendarItem } from '../../calendar/queries.ts';
import type { DashboardCardOf } from '../queries.ts';
import { SectionHeading } from './DashboardCardFrame.tsx';

/** 今日のタスク。行のチェックボックスで完了操作ができるので、区画全体はリンクにしない。 */
export function TodayTasksCard({ card }: { card: DashboardCardOf<'tasks-today'> }) {
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const navigate = useNavigate();
  return (
    <Box component="section" sx={{ py: 1 }}>
      <SectionHeading
        title="今日のタスク"
        onClick={() => navigate({ to: '/calendar', search: { view: 'list', kind: 'task' } })}
      />
      {card.data.length === 0 ? (
        <Typography variant="body2" color="text.disabled" sx={{ px: 2 }}>
          なし
        </Typography>
      ) : (
        card.data.map((task) => (
          <ItemCard key={`${task.id}:${task.occurrenceKey}`} item={task} onClick={setSelected} />
        ))
      )}
      <ItemDialogs item={selected} onClose={() => setSelected(null)} />
    </Box>
  );
}
