import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { taskTime } from '../../../../shared/calendar.ts';
import type { DateString } from '../../../../shared/types.ts';
import {
  minutesOfDay,
  toDateString,
  WEEKDAY_LABELS,
  weekdayColor,
  weekdayIndex,
} from '../../../lib/date.ts';
import { useIsMobile } from '../../../lib/ui/use-breakpoint.ts';
import { useUserColor } from '../../users/use-user-color.ts';
import { draftColumns, type EventDraft } from '../draft.ts';
import { type CalendarItem, colorUserOf } from '../queries.ts';
import { useDayDrag } from '../use-day-drag.ts';
import { DayNumber } from './DayNumber.tsx';
import { DraftBar } from './DraftBlock.tsx';
import { GridChip } from './GridChip.tsx';
import { itemKey, layoutLanes } from './lane-layout.ts';
import { TimeGrid } from './TimeGrid.tsx';
import { layoutTimed, MIN_BLOCK_MINUTES, type TimedPlaced } from './timeline-layout.ts';

type Props = {
  /** 表示する日（週なら 7 日、日なら 1 日） */
  days: DateString[];
  itemsByDate: Map<DateString, CalendarItem[]>;
  onSelectItem: (item: CalendarItem) => void;
  /** 週表示で日付の見出しをタップしたとき（日表示へ） */
  onSelectDate?: (date: DateString) => void;
  /** 追加しようとしている予定の範囲（終日欄と時間軸に出す） */
  draft: EventDraft | null;
  /** 空いている所をなぞって範囲を選んだとき。done はポインタを離したか */
  onChangeDraft: (draft: EventDraft, done: boolean) => void;
  /** 全体の高さ（画面の残り全部）。時間軸はこの中でスクロールする */
  height: string;
};

const GUTTER_WIDTH = 44;
const LANE_HEIGHT = 20;

/**
 * 週・日のタイムライン表示（Google カレンダー方式）。
 * 上に日付の見出しと終日欄（終日・複数日の予定、時刻の無いタスク）、下に 0〜24 時の時間軸（TimeGrid）。
 * ここでは項目を終日欄と時間軸に振り分けるだけで、描画は各部品に任せる。
 * 終日欄をなぞると終日の予定、時間軸をなぞるとその時間帯の予定を追加できる。
 * 終日の帯は月表示と同じ見た目（つまむ丸は出さない）で、直すのは下のセルの長押しから（`use-day-drag.ts`）。
 */
export function TimelineView({
  days,
  itemsByDate,
  onSelectItem,
  onSelectDate,
  draft,
  onChangeDraft,
  height,
}: Props) {
  const compact = useIsMobile();
  const colorFor = useUserColor();
  const dayDrag = useDayDrag({ draft, onChange: onChangeDraft });
  const hourHeight = compact ? 48 : 56;
  const single = days.length === 1;

  const allDayByDate = new Map<DateString, CalendarItem[]>();
  const timedByDate = new Map<DateString, TimedPlaced<CalendarItem>[]>();
  for (const day of days) {
    const allDay: CalendarItem[] = [];
    const timed: { key: string; item: CalendarItem; startMin: number; endMin: number }[] = [];
    for (const item of itemsByDate.get(day) ?? []) {
      const slot = timeSlot(item);
      if (slot) timed.push({ key: itemKey(item), item, ...slot });
      else allDay.push(item);
    }
    allDayByDate.set(day, allDay);
    timedByDate.set(day, layoutTimed(timed));
  }
  const lanes = layoutLanes(days, allDayByDate);
  const laneCount = Math.max(1, ...lanes.map((p) => p.lane + 1));
  // 終日の下書きは既存の帯とぶつからないよう、終日欄に 1 行足してその行に置く。
  // 時間指定の下書きは終日欄ではなく時間軸に枠で出るので、ここでは持たない
  const draftCols = draft?.allDay ? draftColumns(draft, days) : null;
  const columns = `${GUTTER_WIDTH}px repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <Box sx={{ height, display: 'flex', flexDirection: 'column', userSelect: 'none' }}>
      {/* 日付の見出し */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: columns,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Box />
        {days.map((day) => {
          const weekday = weekdayIndex(day);
          return (
            <ButtonBase
              key={day}
              disabled={!onSelectDate}
              onClick={() => onSelectDate?.(day)}
              sx={{
                display: 'flex',
                flexDirection: single ? 'row' : 'column',
                alignItems: 'center',
                justifyContent: single ? 'flex-start' : 'center',
                gap: single ? 1 : 0,
                py: 0.5,
                px: single ? 1 : 0,
                borderLeft: 1,
                borderColor: 'divider',
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontSize: '0.7rem',
                  lineHeight: 1.2,
                  color: weekday < 5 ? 'text.secondary' : weekdayColor(weekday),
                }}
              >
                {WEEKDAY_LABELS[weekday]}
              </Typography>
              <DayNumber date={day} size={28} />
            </ButtonBase>
          );
        })}
      </Box>

      {/* 終日欄 */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: columns,
          gridTemplateRows: `0px repeat(${laneCount + (draftCols ? 1 : 0)}, ${LANE_HEIGHT}px)`,
          borderBottom: 1,
          borderColor: 'divider',
          pb: '2px',
        }}
      >
        <Typography
          variant="caption"
          sx={{
            gridColumn: 1,
            gridRow: '2 / -1',
            alignSelf: 'start',
            textAlign: 'right',
            pr: 0.5,
            fontSize: '0.65rem',
            color: 'text.secondary',
            lineHeight: `${LANE_HEIGHT}px`,
          }}
        >
          終日
        </Typography>
        {days.map((day, i) => (
          <Box
            key={day}
            data-date={day}
            {...dayDrag}
            sx={{ gridColumn: i + 2, gridRow: '1 / -1', borderLeft: 1, borderColor: 'divider' }}
          />
        ))}
        {lanes.map((p) => (
          <GridChip
            key={p.key}
            placed={{ ...p, col: p.col + 1 }}
            compact={compact}
            showTime={false}
            colors={colorFor(colorUserOf(p.item))}
            onClick={() => onSelectItem(p.item)}
          />
        ))}
        {draftCols && (
          <DraftBar columns={{ ...draftCols, col: draftCols.col + 1 }} lane={laneCount} />
        )}
      </Box>

      <TimeGrid
        days={days}
        timedByDate={timedByDate}
        hourHeight={hourHeight}
        gutterWidth={GUTTER_WIDTH}
        onSelectItem={onSelectItem}
        draft={draft}
        onChangeDraft={onChangeDraft}
      />
    </Box>
  );
}

/** 時間軸に置く項目の時間帯（分）。終日・複数日の予定と、時刻の無い（または別の日の時刻の）タスクは null（終日欄へ） */
function timeSlot(item: CalendarItem): { startMin: number; endMin: number } | null {
  if (item.kind === 'event') {
    if (item.allDay || item.dayCount > 1) return null;
    return { startMin: minutesOfDay(item.startsAt), endMin: minutesOfDay(item.endsAt) || 24 * 60 };
  }
  const time = taskTime(item);
  if (!time || toDateString(new Date(time.at)) !== item.placementDate) return null;
  const startMin = minutesOfDay(time.at);
  return { startMin, endMin: startMin + MIN_BLOCK_MINUTES };
}
