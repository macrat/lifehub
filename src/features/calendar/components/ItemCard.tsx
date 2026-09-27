import RepeatIcon from '@mui/icons-material/Repeat';
import Typography from '@mui/material/Typography';
import {
  type CalendarEventItem,
  type CalendarItem,
  type CalendarTaskItem,
  isCompletedTask,
  TASK_TIME_LABELS,
  taskTime,
  taskTimeOnPlacementDate,
} from '../../../../shared/calendar.ts';
import { formatDate, formatTime, isToday } from '../../../lib/date.ts';
import { MarkedRow } from '../../../lib/ui/MarkedRow.tsx';
import { COMPLETED_SX, COMPLETED_TITLE_SX } from '../../events/components/completed-style.ts';
import { ParticipantsMark } from '../../events/components/ParticipantsMark.tsx';
import { TaskCheckbox } from '../../events/components/TaskCheckbox.tsx';

import { useUserLabels } from '../../users/use-user-labels.ts';
import { itemTransitionName } from '../item-transition.ts';

/** 印の枠の幅。タスクのチェックボックス（押せる範囲の余白を含めて 28px。`TaskCheckbox`）が収まる幅 */
const MARK_WIDTH = 28;

/** 時刻の列の幅 */
const TIME_WIDTH = 64;

type Props = {
  item: CalendarItem;
  /** 行を押したとき。editing は長押し（編集で開く）か */
  onSelect: (item: CalendarItem, editing: boolean) => void;
};

/**
 * 一覧（リスト表示）の 1 行（`MarkedRow`。立替の履歴と同じ骨組み）。
 * 印は予定が参加者の色を重ねたベン図（`ParticipantsMark`）、タスクは参加者の色で塗り分けたチェックボックス。
 * 主列は時刻（折り返さない）、本文はタイトルとメタ情報。期限超過は赤、完了は薄く取り消し線。
 * 印を含む行全体が押せる範囲で、単押しは閲覧、長押しは編集（グリッドの長押しと違い、ここは日時を直に動かせないのでシートで開く）。
 * タスクのチェックボックスは行の上に重ね、押すと完了が切り替わる（`PressableRow`）。
 */
export function ItemCard({ item, onSelect }: Props) {
  const { label } = useUserLabels();
  const isTask = item.kind === 'task';
  const completed = isCompletedTask(item);
  const overdue = isTask && item.isOverdue;
  const time = isTask ? taskTimeLabel(item) : eventTimeLabel(item);
  const meta = [item.participantIds.map(label).join('・'), item.location]
    .filter(Boolean)
    .join(' · ');

  return (
    <MarkedRow
      onSelect={(editing) => onSelect(item, editing)}
      sx={{
        ...(completed && COMPLETED_SX),
        // 表示を切り替えたとき、同じ項目がこの行から動く
        viewTransitionName: itemTransitionName(item),
      }}
      mark={!isTask && <ParticipantsMark participantIds={item.participantIds} />}
      control={isTask && <TaskCheckbox item={item} />}
      markWidth={MARK_WIDTH}
      leadWidth={TIME_WIDTH}
      lead={
        <>
          {time.caption && (
            <Typography
              variant="caption"
              component="div"
              color={overdue ? 'error' : 'textSecondary'}
              sx={{ lineHeight: 1.2 }}
            >
              {time.caption}
            </Typography>
          )}
          <Typography
            variant="body2"
            component="div"
            color={overdue ? 'error' : 'textPrimary'}
            sx={{ lineHeight: 1.3 }}
          >
            {time.main}
          </Typography>
          {time.sub && (
            <Typography
              variant="caption"
              component="div"
              color={overdue ? 'error' : 'textSecondary'}
              sx={{ lineHeight: 1.2 }}
            >
              {time.sub}
            </Typography>
          )}
        </>
      }
    >
      <Typography sx={{ overflowWrap: 'anywhere', ...(completed && COMPLETED_TITLE_SX) }}>
        {item.title}
      </Typography>
      <Typography
        variant="caption"
        color="textSecondary"
        component="div"
        noWrap
        sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
      >
        {meta}
        {item.isRecurring && <RepeatIcon sx={{ fontSize: 14 }} titleAccess="繰り返し" />}
      </Typography>
    </MarkedRow>
  );
}

type TimeLabel = { caption?: string; main: string; sub?: string };

function eventTimeLabel(item: CalendarEventItem): TimeLabel {
  if (item.allDay) return { main: '終日' };
  if (item.dayCount > 1) return { main: `${item.dayIndex}/${item.dayCount}日目` };
  return { main: formatTime(item.startsAt), sub: `〜${formatTime(item.endsAt)}` };
}

/**
 * タスクの日時は `taskTime`（完了 → 開始 → 期限の優先）を見出し付きで示す。
 * 日付だけ（終日）なら日付（今日なら「今日」）。時刻が表示位置の日と違う（繰り越し・期限が別日）ときは日付も付ける。
 */
function taskTimeLabel(item: CalendarTaskItem): TimeLabel {
  const time = taskTime(item);
  if (!time) return { main: '' };
  const caption = TASK_TIME_LABELS[time.kind];
  if (time.at === null)
    return { caption, main: isToday(time.date) ? '今日' : formatDate(time.date) };
  return taskTimeOnPlacementDate(item)
    ? { caption, main: formatTime(time.at) }
    : { caption, main: formatDate(time.at), sub: formatTime(time.at) };
}
