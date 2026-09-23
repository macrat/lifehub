import RepeatIcon from '@mui/icons-material/Repeat';
import Typography from '@mui/material/Typography';
import { isCompletedTask, taskTime, taskTimeOnPlacementDate } from '../../../../shared/calendar.ts';
import { formatDate, formatTime } from '../../../lib/date.ts';
import { MarkedRow } from '../../../lib/ui/MarkedRow.tsx';
import {
  COMPLETED_ROW_SX,
  COMPLETED_TITLE_SX,
  TaskCheckbox,
} from '../../events/components/TaskCheckbox.tsx';
import { useUserLabels } from '../../users/use-user-labels.ts';
import type { CalendarEventItem, CalendarItem, CalendarTaskItem } from '../queries.ts';
import { itemTransitionName } from './item-transition.ts';
import { ParticipantsMark } from './ParticipantsMark.tsx';

type Props = {
  item: CalendarItem;
  /** 行を押したとき。editing は長押し（編集で開く）か */
  onSelect: (item: CalendarItem, editing: boolean) => void;
};

/**
 * 一覧（リスト表示）の 1 行（`MarkedRow`。立替の履歴と同じ骨組み）。
 * 印は予定が参加者の色を重ねたベン図（`ParticipantsMark`）、タスクは参加者（1 人のとき）の色のチェックボックス。
 * 主列は時刻（折り返さない）、本文はタイトルとメタ情報。期限超過は赤、完了は薄く取り消し線。
 * 単押しは閲覧、長押しは編集（グリッドの長押しと違い、ここは日時を直に動かせないのでシートで開く）。
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
        ...(completed && COMPLETED_ROW_SX),
        // 表示を切り替えたとき、同じ項目がこの行から動く
        viewTransitionName: itemTransitionName(item),
      }}
      mark={
        isTask ? (
          <TaskCheckbox item={item} />
        ) : (
          <ParticipantsMark participantIds={item.participantIds} />
        )
      }
      leadWidth={64}
      lead={
        <>
          {time.caption && (
            <Typography
              variant="caption"
              component="div"
              color={overdue ? 'error' : 'text.secondary'}
              sx={{ lineHeight: 1.2 }}
            >
              {time.caption}
            </Typography>
          )}
          <Typography
            variant="body2"
            component="div"
            color={overdue ? 'error' : 'text.primary'}
            sx={{ lineHeight: 1.3 }}
          >
            {time.main}
          </Typography>
          {time.sub && (
            <Typography
              variant="caption"
              component="div"
              color={overdue ? 'error' : 'text.secondary'}
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
        color="text.secondary"
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

const TASK_TIME_CAPTIONS = { done: '完了', due: '期限', start: '開始' } as const;

/**
 * タスクの時刻は `taskTime`（完了 → 期限 → 開始の優先）を見出し付きで示す。
 * 時刻が表示位置の日と違う（繰り越し・期限が別日）ときは日付も付ける。
 */
function taskTimeLabel(item: CalendarTaskItem): TimeLabel {
  const time = taskTime(item);
  if (!time) return { main: '' };
  const caption = TASK_TIME_CAPTIONS[time.kind];
  return taskTimeOnPlacementDate(item)
    ? { caption, main: formatTime(time.at) }
    : { caption, main: formatDate(time.at), sub: formatTime(time.at) };
}
