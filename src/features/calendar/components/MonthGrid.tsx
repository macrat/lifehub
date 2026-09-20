import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useLayoutEffect, useRef, useState } from 'react';
import type { DateString } from '../../../../shared/types.ts';
import { formatTime, isToday, monthGridDays, WEEKDAY_LABELS } from '../../../lib/date.ts';
import type { CalendarItem } from '../queries.ts';

type Props = {
  month: string;
  itemsByDate: Map<DateString, CalendarItem[]>;
  selectedDate: DateString;
  onSelectDate: (date: DateString) => void;
  onSelectItem: (item: CalendarItem) => void;
  /** グリッド全体の高さ（例: 画面の残り全部）。省略時は内容に合わせる */
  height?: string;
};

const DAY_NUMBER_HEIGHT = 22;

/**
 * 月グリッド（Google カレンダー方式）。
 * - 複数日の予定は週の行をまたいで 1 本の帯にする（レーンを割り当てて重ならないように置く）
 * - 終日は塗り帯、時間指定の予定は点＋タイトル、タスクはチェック印＋タイトル。タイトルを優先し、時刻は PC でだけ添える
 * - 高さが与えられれば 6 週で等分し、入りきらない項目は「+n」にまとめる
 */
export function MonthGrid({
  month,
  itemsByDate,
  selectedDate,
  onSelectDate,
  onSelectItem,
  height,
}: Props) {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('sm'));
  const laneHeight = compact ? 17 : 20;
  const days = monthGridDays(month);
  const weeks = Array.from({ length: 6 }, (_, w) => days.slice(w * 7, w * 7 + 7));

  // 1 週の行に入るレーン数を実測から決める（高さ固定のとき）。可変のときは一定数にする
  const firstWeekRef = useRef<HTMLDivElement>(null);
  const [maxLanes, setMaxLanes] = useState(4);
  useLayoutEffect(() => {
    if (!height) {
      setMaxLanes(4);
      return;
    }
    const el = firstWeekRef.current;
    if (!el) return;
    const measure = () => {
      const lanes = Math.floor((el.clientHeight - DAY_NUMBER_HEIGHT - 2) / laneHeight);
      setMaxLanes(Math.max(1, lanes));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [height, laneHeight]);

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateRows: height ? 'auto repeat(6, minmax(0, 1fr))' : undefined,
        height,
        borderTop: 1,
        borderColor: 'divider',
        userSelect: 'none',
      }}
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
        {WEEKDAY_LABELS.map((label, i) => (
          <Typography
            key={label}
            variant="caption"
            align="center"
            sx={{
              py: 0.25,
              lineHeight: 1.4,
              fontSize: '0.7rem',
              color: i === 5 ? 'info.main' : i === 6 ? 'error.main' : 'text.secondary',
            }}
          >
            {label}
          </Typography>
        ))}
      </Box>
      {weeks.map((week, w) => (
        <WeekRow
          key={week[0]}
          ref={w === 0 ? firstWeekRef : undefined}
          days={week}
          month={month}
          itemsByDate={itemsByDate}
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
          onSelectItem={onSelectItem}
          maxLanes={maxLanes}
          laneHeight={laneHeight}
          compact={compact}
          fixed={height !== undefined}
        />
      ))}
    </Box>
  );
}

type Placed = {
  key: string;
  item: CalendarItem;
  col: number;
  span: number;
  lane: number;
  roundStart: boolean;
  roundEnd: boolean;
};

/** 1 週分の項目にレーン（行）を割り当てる。複数日の帯を先に、次に日ごとの項目を左から順に置く */
function layoutWeek(days: DateString[], itemsByDate: Map<DateString, CalendarItem[]>): Placed[] {
  const entries: Omit<Placed, 'lane'>[] = [];
  const seenBars = new Set<string>();
  days.forEach((day, col) => {
    for (const item of itemsByDate.get(day) ?? []) {
      if (item.kind === 'event' && item.dayCount > 1) {
        const key = `${item.id}:${item.occurrenceStart}`;
        if (seenBars.has(key)) continue;
        seenBars.add(key);
        let span = 1;
        while (
          col + span < 7 &&
          (itemsByDate.get(days[col + span] as DateString) ?? []).some(
            (i) => i.kind === 'event' && `${i.id}:${i.occurrenceStart}` === key,
          )
        ) {
          span++;
        }
        entries.push({
          key,
          item,
          col,
          span,
          roundStart: item.dayIndex === 1,
          roundEnd: item.dayIndex + span - 1 === item.dayCount,
        });
      }
    }
  });
  // 帯は開始が早く、長いものを上に
  entries.sort((a, b) => a.col - b.col || b.span - a.span);
  days.forEach((day, col) => {
    for (const item of itemsByDate.get(day) ?? []) {
      if (item.kind === 'event' && item.dayCount > 1) continue;
      const key =
        item.kind === 'event'
          ? `${item.id}:${item.occurrenceStart}`
          : `${item.id}:${item.occurrenceKey}`;
      entries.push({ key, item, col, span: 1, roundStart: true, roundEnd: true });
    }
  });

  const lanes: boolean[][] = [];
  return entries.map((entry) => {
    let lane = 0;
    for (;;) {
      let row = lanes[lane];
      if (!row) {
        row = Array(7).fill(false);
        lanes[lane] = row;
      }
      if (row.slice(entry.col, entry.col + entry.span).every((used) => !used)) {
        row.fill(true, entry.col, entry.col + entry.span);
        break;
      }
      lane++;
    }
    return { ...entry, lane };
  });
}

type WeekRowProps = {
  ref?: React.Ref<HTMLDivElement>;
  days: DateString[];
  month: string;
  itemsByDate: Map<DateString, CalendarItem[]>;
  selectedDate: DateString;
  onSelectDate: (date: DateString) => void;
  onSelectItem: (item: CalendarItem) => void;
  maxLanes: number;
  laneHeight: number;
  compact: boolean;
  fixed: boolean;
};

function WeekRow({
  ref,
  days,
  month,
  itemsByDate,
  selectedDate,
  onSelectDate,
  onSelectItem,
  maxLanes,
  laneHeight,
  compact,
  fixed,
}: WeekRowProps) {
  const placed = layoutWeek(days, itemsByDate);
  const visible = placed.filter(
    (p) => p.lane < maxLanes - (placed.some((q) => q.lane >= maxLanes) ? 1 : 0),
  );
  const hiddenLaneStart = visible.length === placed.length ? maxLanes : maxLanes - 1;
  const hiddenPerCol = Array(7).fill(0) as number[];
  for (const p of placed) {
    if (p.lane >= hiddenLaneStart)
      for (let c = p.col; c < p.col + p.span; c++) hiddenPerCol[c] = (hiddenPerCol[c] ?? 0) + 1;
  }
  const usedLanes = Math.max(0, ...placed.map((p) => p.lane + 1));
  const rows = fixed ? maxLanes : Math.max(1, Math.min(usedLanes, maxLanes));

  return (
    <Box
      ref={ref}
      sx={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
        gridTemplateRows: `${DAY_NUMBER_HEIGHT}px repeat(${rows}, ${laneHeight}px)`,
        minHeight: fixed ? 0 : DAY_NUMBER_HEIGHT + laneHeight * 3 + 4,
        overflow: 'hidden',
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      {/* 背景の日セル: 罫線・選択・今日・タップ */}
      {days.map((date, col) => {
        const inMonth = date.startsWith(month);
        const selected = date === selectedDate;
        const today = isToday(date);
        return (
          <Box
            key={date}
            role="button"
            tabIndex={0}
            aria-label={date}
            aria-pressed={selected}
            onClick={() => onSelectDate(date)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelectDate(date);
            }}
            sx={{
              gridColumn: col + 1,
              gridRow: '1 / -1',
              borderLeft: col === 0 ? 0 : 1,
              borderColor: 'divider',
              bgcolor: selected ? 'action.selected' : 'transparent',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'flex-start',
              pt: '2px',
            }}
          >
            <Typography
              variant="caption"
              component="span"
              sx={{
                width: 18,
                height: 18,
                lineHeight: '18px',
                textAlign: 'center',
                borderRadius: '50%',
                fontSize: '0.7rem',
                fontWeight: today ? 700 : 400,
                bgcolor: today ? 'primary.main' : 'transparent',
                color: today
                  ? 'primary.contrastText'
                  : !inMonth
                    ? 'text.disabled'
                    : col === 5
                      ? 'info.main'
                      : col === 6
                        ? 'error.main'
                        : 'text.primary',
              }}
            >
              {Number(date.slice(8))}
            </Typography>
          </Box>
        );
      })}
      {/* 項目 */}
      {visible.map((p) => (
        <GridChip
          key={p.key}
          placed={p}
          compact={compact}
          onClick={compact ? undefined : () => onSelectItem(p.item)}
        />
      ))}
      {hiddenPerCol.map((n, col) =>
        n > 0 ? (
          <Typography
            key={days[col]}
            variant="caption"
            component="button"
            type="button"
            onClick={() => onSelectDate(days[col] as DateString)}
            sx={{
              all: 'unset',
              gridColumn: col + 1,
              gridRow: hiddenLaneStart + 2,
              cursor: 'pointer',
              px: 0.5,
              fontSize: compact ? '0.6rem' : '0.7rem',
              lineHeight: `${laneHeight}px`,
              color: 'text.secondary',
              whiteSpace: 'nowrap',
            }}
          >
            +{n}
          </Typography>
        ) : null,
      )}
    </Box>
  );
}

/**
 * セル内の 1 項目。帯（終日・複数日）／点＋タイトル（時間指定）／チェック印＋タイトル（タスク）。
 * onClick が無ければ表示専用（スマホ）: 小さな項目を狙わせず、セルのどこをタップしても日を選ぶ
 * （Google カレンダーのスマホ月表示と同じ）。項目はグリッド下の日別一覧から開く。
 */
function GridChip({
  placed,
  compact,
  onClick,
}: {
  placed: Placed;
  compact: boolean;
  onClick?: () => void;
}) {
  const { item, col, span, lane, roundStart, roundEnd } = placed;
  // 終日と複数日の予定は塗り帯にする（時間指定でも日をまたぐなら帯）
  const isBar = item.kind === 'event' && (item.allDay || span > 1 || item.dayCount > 1);
  const isTask = item.kind === 'task';
  const completed = isTask && item.completedAt !== null;
  const overdue = isTask && item.isOverdue;
  const time = item.kind === 'event' && !item.allDay && !compact ? formatTime(item.startsAt) : null;
  const radius = 4;
  return (
    <Box
      component={onClick ? 'button' : 'span'}
      type={onClick ? 'button' : undefined}
      onClick={
        onClick
          ? (e: React.MouseEvent) => {
              e.stopPropagation();
              onClick();
            }
          : undefined
      }
      aria-label={item.title}
      sx={{
        all: 'unset',
        boxSizing: 'border-box',
        pointerEvents: onClick ? 'auto' : 'none',
        gridColumn: `${col + 1} / span ${span}`,
        gridRow: lane + 2,
        alignSelf: 'center',
        height: '100%',
        mx: isBar ? (roundStart && roundEnd ? '2px' : 0) : '2px',
        ml: isBar && !roundStart ? 0 : '2px',
        mr: isBar && !roundEnd ? 0 : '2px',
        px: '3px',
        display: 'flex',
        alignItems: 'center',
        gap: '3px',
        minWidth: 0,
        cursor: onClick ? 'pointer' : 'default',
        fontSize: compact ? '0.62rem' : '0.72rem',
        lineHeight: 1,
        borderRadius: `${roundStart ? radius : 0}px ${roundEnd ? radius : 0}px ${roundEnd ? radius : 0}px ${roundStart ? radius : 0}px`,
        bgcolor: isBar ? 'primary.main' : 'transparent',
        color: isBar
          ? 'primary.contrastText'
          : overdue
            ? 'error.main'
            : completed
              ? 'text.disabled'
              : 'text.primary',
        textDecoration: completed ? 'line-through' : 'none',
        '&:hover': { bgcolor: isBar ? 'primary.dark' : 'action.hover' },
      }}
    >
      {isTask ? (
        completed ? (
          <CheckBoxIcon sx={{ fontSize: compact ? 10 : 12, flexShrink: 0 }} />
        ) : (
          <CheckBoxOutlineBlankIcon sx={{ fontSize: compact ? 10 : 12, flexShrink: 0 }} />
        )
      ) : (
        !isBar && (
          <Box
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              bgcolor: 'primary.main',
              flexShrink: 0,
            }}
          />
        )
      )}
      <Box
        component="span"
        sx={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}
      >
        {time && (
          <Box component="span" sx={{ color: 'text.secondary', mr: '3px' }}>
            {time}
          </Box>
        )}
        {item.title}
      </Box>
    </Box>
  );
}

export function itemKey(item: CalendarItem): string {
  const occurrence = item.kind === 'event' ? item.occurrenceStart : item.occurrenceKey;
  return `${item.kind}:${item.id}:${occurrence}:${item.placementDate}`;
}
