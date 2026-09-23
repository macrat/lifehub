import Checkbox from '@mui/material/Checkbox';
import { isCompletedTask } from '../../../../shared/calendar.ts';
import { ParticipantsCheckIcon } from '../../calendar/components/ParticipantsMark.tsx';
import type { CalendarTaskItem } from '../../calendar/queries.ts';
import { useToggleCompletion } from '../queries.ts';

/**
 * タスクの完了・未完了を切り替えるチェックボックス。一覧の行（リスト表示・ホームの「今日」）で使う。
 * 行の体裁は場所ごとに違ってよいが、操作と読み上げの文言は 1 か所に置く。
 * 参加者の色で塗り分ける（`ParticipantsCheckIcon`）。
 */
export function TaskCheckbox({ item }: { item: CalendarTaskItem }) {
  const toggle = useToggleCompletion();
  const completed = isCompletedTask(item);
  return (
    <Checkbox
      size="small"
      checked={completed}
      onChange={(_, checked) =>
        toggle.mutate({ id: item.id, occurrenceStart: item.occurrenceStart, completed: checked })
      }
      slotProps={{
        input: { 'aria-label': `${item.title} を${completed ? '未完了に戻す' : '完了にする'}` },
      }}
      icon={<ParticipantsCheckIcon participantIds={item.participantIds} checked={false} />}
      checkedIcon={<ParticipantsCheckIcon participantIds={item.participantIds} checked />}
      sx={{ p: 0.5 }}
    />
  );
}
