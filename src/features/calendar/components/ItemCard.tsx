import RepeatIcon from '@mui/icons-material/Repeat';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { taskTime, taskTimeOnPlacementDate } from '../../../../shared/calendar.ts';
import { formatDate, formatTime } from '../../../lib/date.ts';
import {
  COMPLETED_ROW_SX,
  COMPLETED_TITLE_SX,
  TaskCheckbox,
} from '../../events/components/TaskCheckbox.tsx';
import { useUserColor } from '../../users/use-user-color.ts';
import { useUserLabels } from '../../users/use-user-labels.ts';
import {
  type CalendarEventItem,
  type CalendarItem,
  type CalendarTaskItem,
  colorUserOf,
} from '../queries.ts';
import { itemTransitionName } from './item-transition.ts';

type Props = {
  item: CalendarItem;
  onClick: (item: CalendarItem) => void;
};

/**
 * 一覧（リスト表示・ホーム）の 1 行。Google カレンダー／ToDo の行に倣い、枠線を持たない。
 * 左に時刻の列（折り返さない）、右にタイトルとメタ情報。予定は色の点、タスクはチェックボックスで見分け、色は参加者（1 人のとき）のユーザーの色。
 * 期限超過は赤、完了は薄く取り消し線。
 */
export function ItemCard({ item, onClick }: Props) {
  const { label } = useUserLabels();
  const colorFor = useUserColor();
  const isTask = item.kind === 'task';
  const completed = isTask && item.completedAt !== null;
  const overdue = isTask && item.isOverdue;
  const time = isTask ? taskTimeLabel(item) : eventTimeLabel(item);
  const colors = colorFor(colorUserOf(item.participantIds));
  const meta = [item.participantIds.map(label).join('・'), item.location]
    .filter(Boolean)
    .join(' · ');

  return (
    <Stack
      direction="row"
      sx={{
        alignItems: 'stretch',
        ...(completed && COMPLETED_ROW_SX),
        // 表示を切り替えたとき、同じ項目がこの行から動く
        viewTransitionName: itemTransitionName(item),
      }}
    >
      <Box
        sx={{
          width: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {item.kind === 'task' ? (
          <TaskCheckbox item={item} color={colors.fill} />
        ) : (
          <Box
            sx={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              bgcolor: colors.fill,
            }}
          />
        )}
      </Box>
      <ButtonBase
        onClick={() => onClick(item)}
        sx={{
          flexGrow: 1,
          minWidth: 0,
          justifyContent: 'flex-start',
          textAlign: 'left',
          py: 0.75,
          pr: 2,
          gap: 1.5,
          borderRadius: 1,
        }}
      >
        <Box sx={{ width: 64, flexShrink: 0 }}>
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
            sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', lineHeight: 1.3 }}
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
        </Box>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
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
        </Box>
      </ButtonBase>
    </Stack>
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
