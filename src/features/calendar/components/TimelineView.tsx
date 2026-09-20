import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useEffect, useRef, useState } from 'react';
import type { DateString } from '../../../../shared/types.ts';
import {
  formatTime,
  isToday,
  minutesOfDay,
  toDateString,
  today,
  WEEKDAY_LABELS,
  weekDays,
} from '../../../lib/date.ts';
import { type ItemColors, useUserColor } from '../../users/use-user-color.ts';
import type { CalendarItem, CalendarTaskItem } from '../queries.ts';
import { GridChip } from './GridChip.tsx';
import { itemKey, layoutLanes } from './lane-layout.ts';
import { layoutTimed, MIN_BLOCK_MINUTES, type TimedPlaced } from './timeline-layout.ts';

type Props = {
  /** 表示する日（週なら 7 日、日なら 1 日） */
  days: DateString[];
  itemsByDate: Map<DateString, CalendarItem[]>;
  onSelectItem: (item: CalendarItem) => void;
  /** 週表示で日付の見出しをタップしたとき（日表示へ） */
  onSelectDate?: (date: DateString) => void;
  /** 全体の高さ（画面の残り全部）。時間軸はこの中でスクロールする */
  height: string;
};

const GUTTER_WIDTH = 44;
const LANE_HEIGHT = 20;

/**
 * 週・日のタイムライン表示（Google カレンダー方式）。
 * 上に日付の見出しと終日欄（終日・複数日の予定、時刻の無いタスク）、下に 0〜24 時の時間軸。
 * 時間指定の予定は開始〜終了の高さの塗りブロック、時刻付きのタスクはその時刻に小さなブロック。
 * 同じ時間帯に重なる項目は横に並べる。今日の列には現在時刻の線を引く。
 */
export function TimelineView({ days, itemsByDate, onSelectItem, onSelectDate, height }: Props) {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('sm'));
  const colorFor = useUserColor();
  const hourHeight = compact ? 48 : 56;
  const single = days.length === 1;

  // 終日欄と時間軸に振り分ける
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

  // 現在時刻の線（1 分ごとに更新）
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const nowMin = minutesOfDay(now);
  const todayStr = today(now);

  // 初期スクロール: 今日を含むなら現在時刻の少し上、それ以外は 7 時
  const scrollRef = useRef<HTMLDivElement>(null);
  const daysKey = days.join(',');
  // biome-ignore lint/correctness/useExhaustiveDependencies: 表示する日が変わったときに合わせ直す
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = days.includes(todayStr) ? (nowMin / 60) * hourHeight - 120 : 7 * hourHeight;
    el.scrollTop = Math.max(0, target);
  }, [daysKey, hourHeight]);

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
        {days.map((day, i) => {
          const isTodayCol = isToday(day);
          const weekdayIndex = single ? weekdayOf(day) : i;
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
                  color:
                    weekdayIndex === 5
                      ? 'info.main'
                      : weekdayIndex === 6
                        ? 'error.main'
                        : 'text.secondary',
                }}
              >
                {WEEKDAY_LABELS[weekdayIndex]}
              </Typography>
              <Typography
                component="span"
                sx={{
                  width: 28,
                  height: 28,
                  lineHeight: '28px',
                  textAlign: 'center',
                  borderRadius: '50%',
                  fontSize: '0.95rem',
                  fontWeight: isTodayCol ? 700 : 400,
                  bgcolor: isTodayCol ? 'primary.main' : 'transparent',
                  color: isTodayCol ? 'primary.contrastText' : 'text.primary',
                }}
              >
                {Number(day.slice(8))}
              </Typography>
            </ButtonBase>
          );
        })}
      </Box>

      {/* 終日欄 */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: columns,
          gridTemplateRows: `0px repeat(${laneCount}, ${LANE_HEIGHT}px)`,
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
            sx={{
              gridColumn: i + 2,
              gridRow: '1 / -1',
              borderLeft: 1,
              borderColor: 'divider',
            }}
          />
        ))}
        {lanes.map((p) => (
          <GridChip
            key={p.key}
            placed={{ ...p, col: p.col + 1 }}
            compact={compact}
            showTime={false}
            colors={colorFor(ownerOf(p.item))}
            onClick={() => onSelectItem(p.item)}
          />
        ))}
      </Box>

      {/* 時間軸 */}
      <Box ref={scrollRef} sx={{ flexGrow: 1, minHeight: 0, overflowY: 'auto' }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: columns,
            height: hourHeight * 24,
            position: 'relative',
          }}
        >
          {/* 時刻の目盛り */}
          <Box sx={{ position: 'relative' }}>
            {Array.from({ length: 23 }, (_, h) => h + 1).map((h) => (
              <Typography
                key={h}
                variant="caption"
                sx={{
                  position: 'absolute',
                  top: h * hourHeight - 7,
                  right: 4,
                  fontSize: '0.65rem',
                  lineHeight: 1,
                  color: 'text.secondary',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {h}:00
              </Typography>
            ))}
          </Box>
          {days.map((day) => (
            <Box
              key={day}
              sx={{
                position: 'relative',
                borderLeft: 1,
                borderColor: 'divider',
                backgroundImage: (t) =>
                  `repeating-linear-gradient(to bottom, transparent 0, transparent ${hourHeight - 1}px, ${t.palette.divider} ${hourHeight - 1}px, ${t.palette.divider} ${hourHeight}px)`,
              }}
            >
              {(timedByDate.get(day) ?? []).map((p) => (
                <TimedBlock
                  key={p.key}
                  placed={p}
                  hourHeight={hourHeight}
                  colors={colorFor(ownerOf(p.item))}
                  onClick={() => onSelectItem(p.item)}
                />
              ))}
              {day === todayStr && (
                <Box
                  sx={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: (nowMin / 60) * hourHeight,
                    height: 2,
                    bgcolor: 'error.main',
                    pointerEvents: 'none',
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      left: -5,
                      top: -4,
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      bgcolor: 'error.main',
                    },
                  }}
                />
              )}
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

/** 時間軸に置く項目の時間帯（分）。終日・複数日の予定と、時刻の無い（または別の日の時刻の）タスクは null（終日欄へ） */
function timeSlot(item: CalendarItem): { startMin: number; endMin: number } | null {
  if (item.kind === 'event') {
    if (item.allDay || item.dayCount > 1) return null;
    return { startMin: minutesOfDay(item.startsAt), endMin: minutesOfDay(item.endsAt) || 24 * 60 };
  }
  const instant = taskInstant(item);
  if (!instant || toDateString(new Date(instant)) !== item.placementDate) return null;
  const startMin = minutesOfDay(instant);
  return { startMin, endMin: startMin + MIN_BLOCK_MINUTES };
}

/** タスクを時間軸に置くときの時刻: 期限 → 開始の優先 */
function taskInstant(item: CalendarTaskItem): string | null {
  return item.dueAt ?? item.startsAt;
}

function ownerOf(item: CalendarItem): string | null {
  return item.kind === 'event' ? item.ownerUserId : item.assigneeUserId;
}

/** 月曜 = 0 の曜日番号 */
function weekdayOf(day: DateString): number {
  return weekDays(day).indexOf(day);
}

function TimedBlock({
  placed,
  hourHeight,
  colors,
  onClick,
}: {
  placed: TimedPlaced<CalendarItem>;
  hourHeight: number;
  colors: ItemColors;
  onClick: () => void;
}) {
  const { item, startMin, endMin, col, cols } = placed;
  const isTask = item.kind === 'task';
  const completed = isTask && item.completedAt !== null;
  const top = (startMin / 60) * hourHeight;
  const heightPx = Math.max(((endMin - startMin) / 60) * hourHeight, 18) - 2;
  const showTime = heightPx >= 34;
  const width = 100 / cols;
  return (
    <ButtonBase
      onClick={onClick}
      aria-label={item.title}
      sx={{
        position: 'absolute',
        top: top + 1,
        height: heightPx,
        left: `calc(${col * width}% + 1px)`,
        width: `calc(${width}% - 3px)`,
        boxSizing: 'border-box',
        display: 'block',
        textAlign: 'left',
        overflow: 'hidden',
        borderRadius: '4px',
        px: 0.5,
        py: '2px',
        bgcolor: isTask ? colors.tint : colors.fill,
        color: isTask ? 'text.primary' : colors.text,
        borderLeft: isTask ? `3px solid ${colors.fill}` : 'none',
        opacity: completed ? 0.6 : 1,
        textDecoration: completed ? 'line-through' : 'none',
        '&:hover': { filter: 'brightness(0.95)' },
      }}
    >
      <Typography
        component="div"
        sx={{ fontSize: '0.72rem', fontWeight: 600, lineHeight: 1.25, overflowWrap: 'anywhere' }}
      >
        {isTask && (item.completedAt ? '☑ ' : '☐ ')}
        {item.title}
      </Typography>
      {showTime && item.kind === 'event' && (
        <Typography component="div" sx={{ fontSize: '0.65rem', lineHeight: 1.2, opacity: 0.9 }}>
          {formatTime(item.startsAt)}〜{formatTime(item.endsAt)}
        </Typography>
      )}
    </ButtonBase>
  );
}
