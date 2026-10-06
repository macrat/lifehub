import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import { today } from '../../../../shared/date.ts';
import { nextScheduleDate } from '../../../../shared/expenses.ts';
import { formatDate } from '../../../lib/date.ts';
import { EmptyMessage } from '../../../lib/ui/QueryView.tsx';
import { formatYen } from '../../../lib/yen.ts';
import { useUserLabels } from '../../users/use-user-labels.ts';
import type { ExpenseSchedule } from '../queries.ts';
import { FREQUENCY_LABELS } from '../schedule-labels.ts';

type Props = {
  schedules: ExpenseSchedule[];
  onSelect: (schedule: ExpenseSchedule) => void;
};

/**
 * 立替スケジュールの並び。1 行に内容と金額、繰り返し・次に記録する日（今日の回は日付が変わってすぐ記録済みなので、明日から）・
 * To と From。押すと変更のシートを開く
 */
export function ExpenseScheduleList({ schedules, onSelect }: Props) {
  const { label } = useUserLabels();
  if (schedules.length === 0) {
    return <EmptyMessage>立替スケジュールはありません</EmptyMessage>;
  }
  return (
    <List>
      {schedules.map((schedule) => (
        <ListItemButton key={schedule.id} onClick={() => onSelect(schedule)}>
          <ListItemText
            primary={`${schedule.description} ${formatYen(schedule.amount)}`}
            secondary={[
              FREQUENCY_LABELS[schedule.frequency],
              `次回 ${formatDate(nextScheduleDate(schedule, today()))}`,
              `To ${label(schedule.toUserId)}・From ${label(schedule.fromUserId)}`,
            ].join('・')}
          />
        </ListItemButton>
      ))}
    </List>
  );
}
