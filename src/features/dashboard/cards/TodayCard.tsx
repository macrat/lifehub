import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { isCompletedTask, taskTimeOnPlacementDate } from '../../../../shared/calendar.ts';
import { today } from '../../../../shared/date.ts';
import { formatTime } from '../../../lib/date.ts';
import { MarkedRow } from '../../../lib/ui/MarkedRow.tsx';
import { ListSkeleton, QueryView } from '../../../lib/ui/QueryView.tsx';
import { itemTransitionName } from '../../calendar/components/item-transition.ts';
import { itemKey } from '../../calendar/components/lane-layout.ts';
import { ParticipantsMark } from '../../calendar/components/ParticipantsMark.tsx';
import {
  type CalendarItem,
  useCalendarItems,
  useRefreshCalendarItems,
} from '../../calendar/queries.ts';
import { COMPLETED_SX, COMPLETED_TITLE_SX } from '../../events/components/completed-style.ts';
import { ItemDetailSheet } from '../../events/components/ItemDetailSheet.tsx';
import { TaskCheckbox } from '../../events/components/TaskCheckbox.tsx';
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
                onSelect={(item, editing) => setSelected({ item, editing })}
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
  onSelect,
}: {
  item: CalendarItem;
  /** 行を押したとき。editing は長押し（編集で開く）か */
  onSelect: (item: CalendarItem, editing: boolean) => void;
}) {
  const completed = isCompletedTask(item);
  return (
    <MarkedRow
      dense
      onSelect={(editing) => onSelect(item, editing)}
      sx={{
        ...(completed && COMPLETED_SX),
        // 予定画面へ移ったとき、同じ項目がこの行から動く
        viewTransitionName: itemTransitionName(item),
      }}
      mark={
        item.kind === 'task' ? (
          <TaskCheckbox item={item} />
        ) : (
          <ParticipantsMark participantIds={item.participantIds} />
        )
      }
      leadWidth={44}
      lead={
        <Typography
          variant="body2"
          component="span"
          color={item.kind === 'task' && item.isOverdue ? 'error' : 'text.secondary'}
        >
          {timeLabel(item)}
        </Typography>
      }
    >
      <Typography noWrap sx={completed ? COMPLETED_TITLE_SX : undefined}>
        {item.title}
      </Typography>
    </MarkedRow>
  );
}

/**
 * 予定は開始時刻（終日・複数日は「終日」）、タスクは置かれた日にある日時（`taskTimeOnPlacementDate`。
 * 日付だけなら「終日」）。別の日を指す日時は空にする: 1 行に日付を出す余白が無い。
 */
function timeLabel(item: CalendarItem): string {
  if (item.kind === 'event')
    return item.allDay || item.dayCount > 1 ? '終日' : formatTime(item.startsAt);
  const time = taskTimeOnPlacementDate(item);
  if (!time) return '';
  return time.at ? formatTime(time.at) : '終日';
}
