import Checkbox from '@mui/material/Checkbox';
import type { CalendarTaskItem } from '../../calendar/queries.ts';
import { useToggleCompletion } from '../queries.ts';

/**
 * タスクの完了・未完了を切り替えるチェックボックス。一覧の行（リスト表示・ホームの「今日」）で使う。
 * 行の体裁は場所ごとに違ってよいが、操作と読み上げの文言は 1 か所に置く。
 */
export function TaskCheckbox({ item, color }: { item: CalendarTaskItem; color: string }) {
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
      sx={{ p: 0.5, color, '&.Mui-checked': { color } }}
    />
  );
}

/** 完了したタスクの行は薄く、タイトルに取り消し線（リスト表示とホームで同じ見え方にする） */
export const COMPLETED_ROW_SX = { opacity: 0.55 } as const;
export const COMPLETED_TITLE_SX = { textDecoration: 'line-through' } as const;
