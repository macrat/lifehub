import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { useMemo } from 'react';
import { taskTimeOnPlacementDate } from '../../../../shared/calendar.ts';
import type { DateString } from '../../../../shared/types.ts';
import { minutesOfDay, WEEKDAY_LABELS, weekdayColor, weekdayIndex } from '../../../lib/date.ts';
import { useIsMobile } from '../../../lib/ui/use-breakpoint.ts';
import { useUserColor } from '../../users/use-user-color.ts';
import { type Draft, draftColumns, sameOccurrence, timedSlot } from '../draft.ts';
import { type CalendarItem, colorUserOf, useHolidays, useWeather } from '../queries.ts';
import { useDayDrag } from '../use-day-drag.ts';
import { DayNumber } from './DayNumber.tsx';
import { DayWeather } from './DayWeather.tsx';
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
  /** 追加・編集しようとしている予定の枠（終日欄と時間軸に出す） */
  draft: Draft | null;
  /** 枠の色を決めるユーザー（選んでいる参加者から決まる。`colorUserOf`） */
  draftUserId: string | null;
  /** なぞって範囲を決めたとき。done はポインタを離したか */
  onChangeDraft: (draft: Draft, done: boolean) => void;
  /** 全体の高さ（画面の残り全部）。時間軸はこの中でスクロールする */
  height: string;
  /** 時間軸（`TimeGrid`）へそのまま渡す */
  hourHeight: number;
  onZoom: (ratio: number) => void;
  bottomInset: number;
  draftSettled: boolean;
};

const GUTTER_WIDTH = 44;
const LANE_HEIGHT = 20;
const DAY_NUMBER_SIZE = 28;

/**
 * 週・日のタイムライン表示（Google カレンダー方式）。
 * 上に日付の見出しと終日欄（終日・複数日の予定、時刻の無いタスク）、下に 0〜24 時の時間軸（TimeGrid）。
 * ここでは項目を終日欄と時間軸に振り分けるだけで、描画は各部品に任せる。
 * 終日欄をなぞると終日の予定、時間軸をなぞるとその時間帯の予定を追加できる。
 * 終日の帯は月表示と同じ見た目（つまむ丸は出さない）で、直すのは下のセルから（`draft.ts` の `dayGrab`）。
 * 終日の予定も長押しでつまむと編集モードに入り、そのまま日を動かせる（編集中は元の項目を隠して帯で出す）。
 */
export function TimelineView({
  days,
  itemsByDate,
  onSelectItem,
  onSelectDate,
  draft,
  draftUserId,
  onChangeDraft,
  height,
  hourHeight,
  onZoom,
  bottomInset,
  draftSettled,
}: Props) {
  const compact = useIsMobile();
  const colorFor = useUserColor();
  const holidays = useHolidays();
  const weather = useWeather();
  // 終日欄に出す枠。時間指定はこの面では時間軸に枠で出るので持たない（出していない物は掴めない）
  const barDraft = draft?.range.allDay ? draft : null;
  const dayDrag = useDayDrag({ draft: barDraft, onChange: onChangeDraft });
  const single = days.length === 1;

  // 終日欄と時間軸への振り分けと配置は、日付と項目だけで決まる。つまんで高さが変わるたびに
  // 数え直さない（指を動かしている間は毎フレーム描き直される所なので）
  const { timedByDate, lanes } = useMemo(() => {
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
    return { timedByDate, lanes: layoutLanes(days, allDayByDate) };
  }, [days, itemsByDate]);
  const laneCount = Math.max(1, ...lanes.map((p) => p.lane + 1));
  // 終日の下書きは既存の帯とぶつからないよう、終日欄に 1 行足してその行に置く
  const draftCols = barDraft && draftColumns(barDraft.range, days);
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
          const dayWeather = weather.get(day);
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
                // 天気が出せる幅かを DayWeather がこの見出しの幅で決める
                containerType: 'inline-size',
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
              <DayNumber date={day} size={DAY_NUMBER_SIZE} holiday={holidays.has(day)} />
              {/* 天気は見出しの右端に、数字と同じ高さで置く。週表示の数字は列の中央なので、重なる幅なら隠す */}
              {dayWeather && (
                <DayWeather
                  weather={dayWeather}
                  size={single ? 20 : 14}
                  reserve={DAY_NUMBER_SIZE}
                  sx={
                    single
                      ? { ml: 'auto' }
                      : {
                          position: 'absolute',
                          bottom: '4px',
                          right: '2px',
                          height: DAY_NUMBER_SIZE,
                        }
                  }
                />
              )}
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
            {...dayDrag.props}
            sx={{ gridColumn: i + 2, gridRow: '1 / -1', borderLeft: 1, borderColor: 'divider' }}
          />
        ))}
        {lanes.map((p) => (
          <GridChip
            key={p.key}
            placed={{ ...p, col: p.col + 1 }}
            compact={compact}
            showTime={false}
            colors={colorFor(colorUserOf(p.item.participantIds))}
            onClick={() => onSelectItem(p.item)}
            grab={dayDrag.grabItemProps(p.item)}
            hidden={sameOccurrence(barDraft?.item, p.item)}
          />
        ))}
        {draftCols && (
          <DraftBar
            columns={{ ...draftCols, col: draftCols.col + 1 }}
            lane={laneCount}
            colors={colorFor(draftUserId)}
          />
        )}
      </Box>

      <TimeGrid
        days={days}
        timedByDate={timedByDate}
        hourHeight={hourHeight}
        onZoom={onZoom}
        gutterWidth={GUTTER_WIDTH}
        onSelectItem={onSelectItem}
        draft={draft}
        draftUserId={draftUserId}
        onChangeDraft={onChangeDraft}
        bottomInset={bottomInset}
        draftSettled={draftSettled}
      />
    </Box>
  );
}

/**
 * 時間軸に置く項目の時間帯（分）。終日・複数日の予定と、時刻の無い（日付だけ、または別の日の時刻の）タスクは
 * null（終日欄へ）。予定の時間帯は枠と同じ規則（`timedSlot`）で決め、置いた所をそのままつまめるようにする。
 */
function timeSlot(item: CalendarItem): { startMin: number; endMin: number } | null {
  if (item.kind === 'event') return timedSlot(item);
  const time = taskTimeOnPlacementDate(item);
  if (!time?.at) return null;
  const startMin = minutesOfDay(time.at);
  return { startMin, endMin: startMin + MIN_BLOCK_MINUTES };
}
