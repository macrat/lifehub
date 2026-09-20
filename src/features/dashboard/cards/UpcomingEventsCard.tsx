import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { formatEventRange } from '../../../lib/date.ts';
import { useOwnerLabel } from '../../users/use-owner-label.ts';
import type { DashboardCardOf } from '../queries.ts';
import { DashboardCardFrame } from './DashboardCardFrame.tsx';

export function UpcomingEventsCard({ card }: { card: DashboardCardOf<'events-upcoming'> }) {
  const { label } = useOwnerLabel();
  return (
    <DashboardCardFrame title="次の予定" to="/calendar">
      {card.data.length === 0 ? (
        <Typography color="text.secondary">なし</Typography>
      ) : (
        <Stack spacing={0.5}>
          {card.data.map((e) => (
            <Stack
              key={`${e.id}:${e.occurrenceStart}`}
              direction="row"
              spacing={1}
              sx={{ alignItems: 'baseline' }}
            >
              <Typography variant="body2" color="primary" sx={{ flexShrink: 0 }}>
                {formatEventRange(e.startsAt, e.endsAt, e.allDay)}
              </Typography>
              <Typography noWrap sx={{ flexGrow: 1, minWidth: 0 }}>
                {e.title}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                {label(e.ownerUserId)}
              </Typography>
            </Stack>
          ))}
        </Stack>
      )}
    </DashboardCardFrame>
  );
}
