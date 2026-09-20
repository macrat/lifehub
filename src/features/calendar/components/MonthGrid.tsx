import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useLayoutEffect, useRef, useState } from 'react';
import type { DateString } from '../../../../shared/types.ts';
import { isToday, monthGridDays, WEEKDAY_LABELS } from '../../../lib/date.ts';
import { type ItemColors, useUserColor } from '../../users/use-user-color.ts';
import type { CalendarItem } from '../queries.ts';
import { GridChip } from './GridChip.tsx';
import { layoutLanes } from './lane-layout.ts';

type Props = {
  month: string;
  itemsByDate: Map<DateString, CalendarItem[]>;
  /** 日をタップしたとき（日表示へ移る） */
  onSelectDate: (date: DateString) => void;
  /** 項目をクリックしたとき（広い画面のみ。スマホでは項目はタップできず、日をタップする） */
  onSelectItem: (item: CalendarItem) => void;
  /** グリッド全体の高さ（画面の残り全部） */
  height: string;
};

const DAY_NUMBER_HEIGHT = 22;

/**
 * 月グリッド（Google カレンダー方式）。
 * - 複数日の予定は週の行をまたいで 1 本の帯にする（レーンを割り当てて重ならないように置く）
 * - 終日は塗り帯、時間指定の予定は点＋タイトル、タスクはチェック印＋タイトル。タイトルを優先し、時刻は PC でだけ添える
 * - 高さは画面の残り全部。6 週で等分し、入りきらない項目は「+n」にまとめる
 * - 色は所有者・担当者のユーザーの色
 */
export function MonthGrid({ month, itemsByDate, onSelectDate, onSelectItem, height }: Props) {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('sm'));
  const colorFor = useUserColor();
  const laneHeight = compact ? 17 : 20;
  const days = monthGridDays(month);
  const weeks = Array.from({ length: 6 }, (_, w) => days.slice(w * 7, w * 7 + 7));

  // 1 週の行に入るレーン数を実測から決める
  const firstWeekRef = useRef<HTMLDivElement>(null);
  const [maxLanes, setMaxLanes] = useState(3);
  useLayoutEffect(() => {
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
  }, [laneHeight]);

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateRows: 'auto repeat(6, minmax(0, 1fr))',
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
          onSelectDate={onSelectDate}
          onSelectItem={onSelectItem}
          colorFor={colorFor}
          maxLanes={maxLanes}
          laneHeight={laneHeight}
          compact={compact}
        />
      ))}
    </Box>
  );
}

type WeekRowProps = {
  ref?: React.Ref<HTMLDivElement>;
  days: DateString[];
  month: string;
  itemsByDate: Map<DateString, CalendarItem[]>;
  onSelectDate: (date: DateString) => void;
  onSelectItem: (item: CalendarItem) => void;
  colorFor: (userId: string | null) => ItemColors;
  maxLanes: number;
  laneHeight: number;
  compact: boolean;
};

function WeekRow({
  ref,
  days,
  month,
  itemsByDate,
  onSelectDate,
  onSelectItem,
  colorFor,
  maxLanes,
  laneHeight,
  compact,
}: WeekRowProps) {
  const placed = layoutLanes(days, itemsByDate);
  const overflow = placed.some((q) => q.lane >= maxLanes);
  const hiddenLaneStart = overflow ? maxLanes - 1 : maxLanes;
  const visible = placed.filter((p) => p.lane < hiddenLaneStart);
  const hiddenPerCol = Array(7).fill(0) as number[];
  for (const p of placed) {
    if (p.lane >= hiddenLaneStart)
      for (let c = p.col; c < p.col + p.span; c++) hiddenPerCol[c] = (hiddenPerCol[c] ?? 0) + 1;
  }

  return (
    <Box
      ref={ref}
      sx={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
        // 最後に伸びる行を置き、日セル（1 / -1）が行の下端まで届くようにする（罫線が途中で切れない）
        gridTemplateRows: `${DAY_NUMBER_HEIGHT}px repeat(${maxLanes}, ${laneHeight}px) minmax(0, 1fr)`,
        minHeight: 0,
        overflow: 'hidden',
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      {/* 背景の日セル: 罫線・今日・タップ */}
      {days.map((date, col) => {
        const inMonth = date.startsWith(month);
        const today = isToday(date);
        return (
          <Box
            key={date}
            role="button"
            tabIndex={0}
            aria-label={date}
            onClick={() => onSelectDate(date)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelectDate(date);
            }}
            sx={{
              gridColumn: col + 1,
              gridRow: '1 / -1',
              borderLeft: col === 0 ? 0 : 1,
              borderColor: 'divider',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'flex-start',
              pt: '2px',
              '&:hover': { bgcolor: 'action.hover' },
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
      {visible.map((p) => (
        <GridChip
          key={p.key}
          placed={p}
          compact={compact}
          colors={colorFor(p.item.kind === 'event' ? p.item.ownerUserId : p.item.assigneeUserId)}
          onClick={compact ? undefined : () => onSelectItem(p.item)}
        />
      ))}
      {hiddenPerCol.map((n, col) =>
        n > 0 ? (
          <Typography
            key={days[col]}
            variant="caption"
            component="span"
            sx={{
              all: 'unset',
              gridColumn: col + 1,
              gridRow: hiddenLaneStart + 2,
              pointerEvents: 'none',
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
