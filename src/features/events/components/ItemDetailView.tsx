import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { type CalendarItem, TASK_TIME_LABELS } from '../../../../shared/calendar.ts';
import { formatDateTime, formatEdge, formatEventRange } from '../../../lib/date.ts';
import { UserChip } from '../../users/components/UserChip.tsx';
import { describeRRule } from '../recurrence-options.ts';
import { LocationLink, NoteLabel } from './ItemLabels.tsx';

/** 予定・タスクの詳細の、読むだけの中身（日時・参加者・繰り返し・場所・メモ） */
export function ItemDetailView({ item }: { item: CalendarItem }) {
  return (
    <>
      <ItemWhen item={item} />
      <ItemChips item={item} />
      {item.location && <LocationLink location={item.location} />}
      {item.note && <NoteLabel note={item.note} />}
    </>
  );
}

/** 日時。予定は期間を 1 行で、タスクは開始・期限・完了をそれぞれの行で出す */
function ItemWhen({ item }: { item: CalendarItem }) {
  if (item.kind === 'event') {
    return <Typography>{formatEventRange(item.startsAt, item.endsAt, item.allDay)}</Typography>;
  }
  return (
    <>
      {item.startsAt && (
        <Typography>
          {TASK_TIME_LABELS.start}: {formatEdge(item.startsAt, 'start', item.allDay)}
        </Typography>
      )}
      {item.endsAt && (
        <Typography color={item.isOverdue ? 'error' : 'textPrimary'}>
          {TASK_TIME_LABELS.due}: {formatEdge(item.endsAt, 'end', item.allDay)}
          {item.isOverdue && '（超過）'}
        </Typography>
      )}
      {item.completedAt && (
        <Typography color="textSecondary">
          {TASK_TIME_LABELS.done}: {formatDateTime(item.completedAt)}
        </Typography>
      )}
    </>
  );
}

/** 参加者（その人の色で塗る）と、繰り返し・この回だけの変更の印 */
function ItemChips({ item }: { item: CalendarItem }) {
  return (
    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
      {item.participantIds.map((id) => (
        <UserChip key={id} userId={id} />
      ))}
      {item.isRecurring && (
        <Chip size="small" variant="outlined" label={describeRRule(item.rrule)} />
      )}
      {item.isModified && <Chip size="small" variant="outlined" label="この回だけ変更あり" />}
    </Stack>
  );
}
