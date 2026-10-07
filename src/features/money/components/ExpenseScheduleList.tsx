import { today } from '../../../../shared/date.ts';
import type { ExpenseSchedule } from '../../../../shared/money.ts';
import { nextScheduleDate } from '../../../../shared/money.ts';
import { formatDate } from '../../../lib/date.ts';
import { EditableList, EditableListItem } from '../../../lib/ui/EditableList.tsx';
import { EmptyMessage } from '../../../lib/ui/QueryView.tsx';
import { formatYen } from '../../../lib/yen.ts';
import { useUserColor } from '../../users/use-user-color.ts';
import { FREQUENCY_LABELS } from '../schedule-labels.ts';
import { PartiesMark } from './PartiesMark.tsx';

type Props = {
  schedules: ExpenseSchedule[];
  onEdit: (schedule: ExpenseSchedule) => void;
};

/**
 * 立替スケジュールの一覧。行は左に記録する立替の印（お金の画面の立替の印と同じ）、内容と説明（金額・繰り返し・
 * 次に記録する日。今日の回は日付が変わってすぐ記録済みなので明日から数える）、右端の鉛筆で変更を開く（形は `EditableList`）
 */
export function ExpenseScheduleList({ schedules, onEdit }: Props) {
  const colorFor = useUserColor();
  const now = today();
  if (schedules.length === 0) {
    return <EmptyMessage>立替スケジュールはありません</EmptyMessage>;
  }
  return (
    <EditableList>
      {schedules.map((schedule) => (
        <EditableListItem
          key={schedule.id}
          icon={<PartiesMark parties={schedule} colorFor={colorFor} />}
          primary={schedule.description}
          secondary={[
            formatYen(schedule.amount),
            FREQUENCY_LABELS[schedule.frequency],
            `次回 ${formatDate(nextScheduleDate(schedule, now))}`,
          ].join('・')}
          editLabel={`${schedule.description} を編集`}
          onEdit={() => onEdit(schedule)}
        />
      ))}
    </EditableList>
  );
}
