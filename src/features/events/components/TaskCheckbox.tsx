import Checkbox from '@mui/material/Checkbox';
import { SplitCheckboxIcon } from '../../../lib/ui/SplitCheckboxIcon.tsx';
import type { CalendarTaskItem } from '../../calendar/queries.ts';
import { useUserColor } from '../../users/use-user-color.ts';
import { useToggleCompletion } from '../queries.ts';

/**
 * タスクの完了・未完了を切り替えるチェックボックス。一覧の行（リスト表示・ホームの「今日」）で使う。
 * 行の体裁は場所ごとに違ってよいが、操作と読み上げの文言は 1 か所に置く。
 * 色は参加者 1 人ずつの色で塗り分ける（`SplitCheckboxIcon`。予定の印と同じ並び）。
 * 参加者がいなければ共有の無彩色。
 */
export function TaskCheckbox({ item }: { item: CalendarTaskItem }) {
  const toggle = useToggleCompletion();
  const colorFor = useUserColor();
  const completed = item.completedAt !== null;
  const participantColors = item.participantIds.map((id) => colorFor(id).fill);
  const colors = participantColors.length > 0 ? participantColors : [colorFor(null).fill];
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

/** 完了したタスクの行は薄く、タイトルに取り消し線（リスト表示とホームで同じ見え方にする） */
export const COMPLETED_ROW_SX = { opacity: 0.55 } as const;
export const COMPLETED_TITLE_SX = { textDecoration: 'line-through' } as const;
