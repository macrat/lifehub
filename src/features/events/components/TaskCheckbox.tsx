import Checkbox from '@mui/material/Checkbox';
import { SplitCheckboxIcon } from '../../../lib/ui/SplitCheckboxIcon.tsx';
import type { CalendarTaskItem } from '../../calendar/queries.ts';
import { useToggleCompletion } from '../queries.ts';

/**
 * タスクの完了・未完了を切り替えるチェックボックス。一覧の行（リスト表示・ホームの「今日」）で使う。
 * 行の体裁は場所ごとに違ってよいが、操作と読み上げの文言は 1 か所に置く。
 * `colors` で塗り分ける（`SplitCheckboxIcon`）。
 */
export function TaskCheckbox({ item, colors }: { item: CalendarTaskItem; colors: string[] }) {
  const toggle = useToggleCompletion();
  const completed = item.completedAt !== null;
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
      icon={<SplitCheckboxIcon colors={colors} checked={false} />}
      checkedIcon={<SplitCheckboxIcon colors={colors} checked />}
      sx={{ p: 0.5 }}
    />
  );
}
