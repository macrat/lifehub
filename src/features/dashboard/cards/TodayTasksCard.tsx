import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { ItemCard } from '../../calendar/components/ItemCard.tsx';
import { ItemDialogs } from '../../calendar/components/ItemDialogs.tsx';
import type { CalendarItem } from '../../calendar/queries.ts';
import type { DashboardCardOf } from '../queries.ts';

/** 今日のタスク。カード上で完了操作ができるので、枠全体をリンクにはしない。 */
export function TodayTasksCard({ card }: { card: DashboardCardOf<'tasks-today'> }) {
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography
          variant="overline"
          component={Link}
          to="/events"
          color="text.secondary"
          sx={{ display: 'block', textDecoration: 'none' }}
        >
          今日のタスク
        </Typography>
        {card.data.length === 0 ? (
          <Typography color="text.secondary">なし</Typography>
        ) : (
          <Stack spacing={1}>
            {card.data.map((task) => (
              <ItemCard
                key={`${task.id}:${task.occurrenceKey}`}
                item={task}
                onClick={setSelected}
              />
            ))}
          </Stack>
        )}
      </CardContent>
      <ItemDialogs item={selected} onClose={() => setSelected(null)} />
    </Card>
  );
}
