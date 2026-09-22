import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Checkbox from '@mui/material/Checkbox';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { taskTime } from '../../../../shared/calendar.ts';
import { formatTime, toDateString, today } from '../../../lib/date.ts';
import { ListSkeleton, QueryView } from '../../../lib/ui/QueryView.tsx';
import { itemKey } from '../../calendar/components/lane-layout.ts';
import {
  type CalendarItem,
  colorUserOf,
  useCalendarItems,
  useRefreshCalendarItems,
} from '../../calendar/queries.ts';
import { ItemDetailSheet } from '../../events/components/ItemDetailSheet.tsx';
import { useToggleCompletion } from '../../events/queries.ts';
import { useUserColor } from '../../users/use-user-color.ts';
import { DashboardCardFrame } from './DashboardCardFrame.tsx';

/**
 * 今日の予定と、今日の位置にあるタスク（未完了と、今日完了したもの）を 1 つの一覧に。
 * 1 項目 1 行（印・時刻・タイトルだけ）で、名前や終了時刻は出さない。
 * タスクはチェックで完了・未完了を切り替え、行をタップすると詳細。
 *
 * カレンダーと同じ月のキャッシュを読む。そのキャッシュは古くならないので、ホームに入るたびに
 * 取り直す（`useRefreshCalendarItems`。カレンダー画面と同じ扱い）。
 */
export function TodayCard() {
  useRefreshCalendarItems();
  const query = useCalendarItems({ from: today(), to: today() });
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  return (
    <DashboardCardFrame
      title="今日"
      link={{ to: '/calendar', search: { view: 'day' } }}
      disableGutters
    >
      <QueryView query={query} skeleton={<ListSkeleton rows={2} />}>
        {(items) =>
          items.length === 0 ? (
            <Typography variant="body2" color="text.disabled" sx={{ px: 2 }}>
              なし
            </Typography>
          ) : (
            items.map((item) => <TodayRow key={itemKey(item)} item={item} onClick={setSelected} />)
          )
        }
      </QueryView>
      {selected && <ItemDetailSheet item={selected} onClose={() => setSelected(null)} />}
    </DashboardCardFrame>
  );
}

function TodayRow({
  item,
  onClick,
}: {
  item: CalendarItem;
  onClick: (item: CalendarItem) => void;
}) {
  const colorFor = useUserColor();
  const toggle = useToggleCompletion();
  const isTask = item.kind === 'task';
  const completed = isTask && item.completedAt !== null;
  const colors = colorFor(colorUserOf(item.participantIds));
  return (
    <Stack
      direction="row"
      sx={{ alignItems: 'center', minHeight: 36, opacity: completed ? 0.55 : 1 }}
    >
      <Box sx={{ width: 44, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
        {isTask ? (
          <Checkbox
            size="small"
            checked={completed}
            onChange={(_, checked) =>
              toggle.mutate({
                id: item.id,
                occurrenceStart: item.occurrenceStart,
                completed: checked,
              })
            }
            slotProps={{
              input: {
                'aria-label': `${item.title} を${completed ? '未完了に戻す' : '完了にする'}`,
              },
            }}
            sx={{ p: 0.5, color: colors.fill, '&.Mui-checked': { color: colors.fill } }}
          />
        ) : (
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: colors.fill }} />
        )}
      </Box>
      <ButtonBase
        onClick={() => onClick(item)}
        sx={{
          flexGrow: 1,
          minWidth: 0,
          justifyContent: 'flex-start',
          textAlign: 'left',
          py: 0.5,
          pr: 2,
          gap: 1.5,
          borderRadius: 1,
        }}
      >
        <Typography
          variant="body2"
          component="span"
          color={isTask && item.isOverdue ? 'error' : 'text.secondary'}
          sx={{ width: 44, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
        >
          {timeLabel(item)}
        </Typography>
        <Typography
          noWrap
          sx={{ minWidth: 0, textDecoration: completed ? 'line-through' : 'none' }}
        >
          {item.title}
        </Typography>
      </ButtonBase>
    </Stack>
  );
}

/**
 * 予定は開始時刻（終日・複数日は「終日」）、タスクは「完了 → 期限 → 開始」の優先（リスト表示と同じ）。
 * その時刻が今日でなければ（繰り越し・期限が別日）空にする。行に日付を出す余白は無く、
 * 「今日」の一覧では今日の時刻だけが意味を持つ。
 */
function timeLabel(item: CalendarItem): string {
  if (item.kind === 'event')
    return item.allDay || item.dayCount > 1 ? '終日' : formatTime(item.startsAt);
  const time = item.completedAt ? { at: item.completedAt } : taskTime(item);
  if (!time || toDateString(new Date(time.at)) !== item.placementDate) return '';
  return formatTime(time.at);
}
