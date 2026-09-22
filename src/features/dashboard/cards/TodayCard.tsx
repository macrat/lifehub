import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { taskTimeOnPlacementDate } from '../../../../shared/calendar.ts';
import { formatTime, today } from '../../../lib/date.ts';
import { ListSkeleton, QueryView } from '../../../lib/ui/QueryView.tsx';
import { useRecordPress } from '../../../lib/ui/use-record-press.ts';
import { itemKey } from '../../calendar/components/lane-layout.ts';
import {
  type CalendarItem,
  colorUserOf,
  useCalendarItems,
  useRefreshCalendarItems,
} from '../../calendar/queries.ts';
import { ItemDetailSheet } from '../../events/components/ItemDetailSheet.tsx';
import {
  COMPLETED_ROW_SX,
  COMPLETED_TITLE_SX,
  TaskCheckbox,
} from '../../events/components/TaskCheckbox.tsx';
import { useUserColor } from '../../users/use-user-color.ts';
import { DashboardCardFrame } from './DashboardCardFrame.tsx';

/**
 * 今日の予定と、今日の位置にあるタスク（未完了と、今日完了したもの）を 1 つの一覧に。
 * 1 項目 1 行（印・時刻・タイトルだけ）で、名前や終了時刻は出さない。
 * タスクはチェックで完了・未完了を切り替え、行は単押しで詳細、長押しでその詳細が編集で開く
 * （アプリ全体の「単押しは閲覧、長押しは編集」）。
 *
 * カレンダーと同じ月のキャッシュを読む。そのキャッシュは古くならないので、ホームに入るたびに
 * 取り直す（`useRefreshCalendarItems`。カレンダー画面と同じ扱い）。
 */
export function TodayCard() {
  useRefreshCalendarItems();
  const query = useCalendarItems({ from: today(), to: today() });
  // 開いている項目と、どちらの顔（閲覧・編集）で開いたか
  const [selected, setSelected] = useState<{ item: CalendarItem; editing: boolean } | null>(null);
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
            items.map((item) => (
              <TodayRow
                key={itemKey(item)}
                item={item}
                onView={(item) => setSelected({ item, editing: false })}
                onEdit={(item) => setSelected({ item, editing: true })}
              />
            ))
          )
        }
      </QueryView>
      {selected && (
        <ItemDetailSheet
          item={selected.item}
          initialEditing={selected.editing}
          onClose={() => setSelected(null)}
        />
      )}
    </DashboardCardFrame>
  );
}

function TodayRow({
  item,
  onView,
  onEdit,
}: {
  item: CalendarItem;
  onView: (item: CalendarItem) => void;
  onEdit: (item: CalendarItem) => void;
}) {
  const colorFor = useUserColor();
  const press = useRecordPress({ onView: () => onView(item), onEdit: () => onEdit(item) });
  const completed = item.kind === 'task' && item.completedAt !== null;
  const colors = colorFor(colorUserOf(item.participantIds));
  return (
    <Stack
      direction="row"
      sx={{ alignItems: 'center', minHeight: 36, ...(completed && COMPLETED_ROW_SX) }}
    >
      <Box sx={{ width: 44, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
        {item.kind === 'task' ? (
          <TaskCheckbox item={item} color={colors.fill} />
        ) : (
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: colors.fill }} />
        )}
      </Box>
      <ButtonBase
        {...press}
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
          color={item.kind === 'task' && item.isOverdue ? 'error' : 'text.secondary'}
          sx={{ width: 44, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
        >
          {timeLabel(item)}
        </Typography>
        <Typography noWrap sx={{ minWidth: 0, ...(completed && COMPLETED_TITLE_SX) }}>
          {item.title}
        </Typography>
      </ButtonBase>
    </Stack>
  );
}

/**
 * 予定は開始時刻（終日・複数日は「終日」）、タスクは置かれた日にある時刻（`taskTimeOnPlacementDate`）。
 * 別の日を指す時刻は空にする: 1 行に日付を出す余白が無い。
 */
function timeLabel(item: CalendarItem): string {
  if (item.kind === 'event')
    return item.allDay || item.dayCount > 1 ? '終日' : formatTime(item.startsAt);
  const time = taskTimeOnPlacementDate(item);
  return time ? formatTime(time.at) : '';
}
