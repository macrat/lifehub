import Checkbox from '@mui/material/Checkbox';
import type { SxProps, Theme } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { isCompletedTask } from '../../../../shared/calendar.ts';
import { type CalendarTaskItem, useToggleCompletion } from '../queries.ts';
import { ParticipantsCheckIcon } from './ParticipantsMark.tsx';

/**
 * タスクの完了・未完了を切り替えるチェックボックス。一覧の行（リスト表示・ホームのタイムライン）で使う。
 * 行の体裁は場所ごとに違ってよいが、操作と読み上げの文言は 1 か所に置く。
 * 既定の見た目は参加者の色で塗り分けたチェックボックス（`ParticipantsCheckIcon`）。
 * 見た目だけを差し替えたい所（ホームのタイムラインのアイコン）は icons と、その形に合わせた押せる範囲の sx を渡す。
 */
export function TaskCheckbox({
  item,
  icons,
  sx,
}: {
  item: CalendarTaskItem;
  /** 未完了・完了のときの見た目。省くと参加者の色のチェックボックス */
  icons?: { unchecked: ReactNode; checked: ReactNode };
  /** 押せる範囲（押したときの波紋が広がる範囲）の形。icons の形に合わせる */
  sx?: SxProps<Theme>;
}) {
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
      icon={
        icons?.unchecked ?? (
          <ParticipantsCheckIcon participantIds={item.participantIds} checked={false} />
        )
      }
      checkedIcon={
        icons?.checked ?? <ParticipantsCheckIcon participantIds={item.participantIds} checked />
      }
      sx={[icons ? { p: 0 } : { p: 0.5 }, ...(Array.isArray(sx) ? sx : [sx])]}
    />
  );
}
