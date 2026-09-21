import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { useEffect, useRef } from 'react';
import type { DateString } from '../../../../shared/types.ts';
import { formatTime, minutesOfDay, today } from '../../../lib/date.ts';
import { useIsMobile } from '../../../lib/ui/use-breakpoint.ts';
import { useNow } from '../../../lib/use-now.ts';
import { type ItemColors, useUserColor } from '../../users/use-user-color.ts';
import type { EventDraft } from '../draft.ts';
import { type CalendarItem, colorUserOf } from '../queries.ts';
import { useTimeDrag } from '../use-time-drag.ts';
import { DraftBlock } from './DraftBlock.tsx';
import type { TimedPlaced } from './timeline-layout.ts';

type Props = {
  days: DateString[];
  /** 日ごとの時間指定の項目（列の割り当て済み） */
  timedByDate: Map<DateString, TimedPlaced<CalendarItem>[]>;
  hourHeight: number;
  gutterWidth: number;
  onSelectItem: (item: CalendarItem) => void;
  /** 追加しようとしている予定の範囲（時間指定のものだけここに出す） */
  draft: EventDraft | null;
  /** 空いている所をなぞって時間帯を選んだとき。done はポインタを離したか */
  onChangeDraft: (draft: EventDraft, done: boolean) => void;
};

/**
 * 0〜24 時の時間軸。縦にスクロールし、時間指定の項目を開始〜終了の高さで置く。今日の列には現在時刻の線。
 * 初期スクロールは、今日を含むなら現在時刻の少し上、それ以外は 7 時。
 * 空いている所をタップ・ドラッグすると、その時間帯を選んで予定を追加できる（`use-time-drag.ts`）。
 */
export function TimeGrid({
  days,
  timedByDate,
  hourHeight,
  gutterWidth,
  onSelectItem,
  draft,
  onChangeDraft,
}: Props) {
  const colorFor = useUserColor();
  // 端をつまんで調整できるのはタッチのとき。PC は下書きに寄せた吹き出しが前に出るので丸は出さない
  const compact = useIsMobile();
  const drag = useTimeDrag({ hourHeight, onChange: onChangeDraft });
  const timedDraft = draft?.allDay === false ? draft : null;
  const now = useNow();
  const nowMin = minutesOfDay(now);
  const todayStr = today(now);

  const scrollRef = useRef<HTMLDivElement>(null);
  const daysKey = days.join(',');
  // biome-ignore lint/correctness/useExhaustiveDependencies: 表示する日が変わったときに合わせ直す
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = days.includes(todayStr) ? (nowMin / 60) * hourHeight - 120 : 7 * hourHeight;
    el.scrollTop = Math.max(0, target);
  }, [daysKey, hourHeight]);

  return (
    <Box ref={scrollRef} sx={{ flexGrow: 1, minHeight: 0, overflowY: 'auto' }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `${gutterWidth}px repeat(${days.length}, minmax(0, 1fr))`,
          height: hourHeight * 24,
          position: 'relative',
        }}
      >
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
            data-date={day}
            {...drag.props}
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
                colors={colorFor(colorUserOf(p.item))}
                onClick={() => onSelectItem(p.item)}
              />
            ))}
            {timedDraft?.date === day && (
              <DraftBlock
                draft={timedDraft}
                hourHeight={hourHeight}
                handleProps={compact ? drag.handleProps : null}
              />
            )}
            {day === todayStr && <NowLine top={(nowMin / 60) * hourHeight} />}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function NowLine({ top }: { top: number }) {
  return (
    <Box
      sx={{
        position: 'absolute',
        left: 0,
        right: 0,
        top,
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
  );
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
