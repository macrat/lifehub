import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { DateString } from '../../../../shared/types.ts';
import { formatTime, minutesOfDay, today } from '../../../lib/date.ts';
import { useIsMobile } from '../../../lib/ui/use-breakpoint.ts';
import { useNow } from '../../../lib/use-now.ts';
import { type ItemColors, useUserColor } from '../../users/use-user-color.ts';
import type { EventDraft } from '../draft.ts';
import { type CalendarItem, colorUserOf } from '../queries.ts';
import { usePinch } from '../use-pinch.ts';
import { useTimeDrag } from '../use-time-drag.ts';
import { DraftBlock } from './DraftBlock.tsx';
import { itemTransitionName } from './item-transition.ts';
import { syncScrollProps } from './SwipePager.tsx';
import type { TimedPlaced } from './timeline-layout.ts';

type Props = {
  days: DateString[];
  /** 日ごとの時間指定の項目（列の割り当て済み） */
  timedByDate: Map<DateString, TimedPlaced<CalendarItem>[]>;
  /** 1 時間あたりの高さ（px）。つまむと変わる（`use-hour-zoom.ts`） */
  hourHeight: number;
  /** つまんで拡げ縮めしたとき。直前からの倍率 */
  onZoom: (ratio: number) => void;
  gutterWidth: number;
  onSelectItem: (item: CalendarItem) => void;
  /** 追加しようとしている予定の範囲（時間指定のものだけここに出す） */
  draft: EventDraft | null;
  /** 下書きの色を決めるユーザー（選んでいる参加者から決まる。`colorUserOf`） */
  draftUserId: string | null;
  /** 空いている所をなぞって時間帯を選んだとき。done はポインタを離したか */
  onChangeDraft: (draft: EventDraft, done: boolean) => void;
};

/**
 * 0〜24 時の時間軸。縦にスクロールし、時間指定の項目を開始〜終了の高さで置く。今日の列には現在時刻の線。
 * 縦の位置を合わせるのは最初に出したときだけ（今日を含むなら現在時刻の少し上、それ以外は 7 時）。
 * 日付を移っても保つので、スワイプの前後でも見ていた時間帯がそのまま残る。
 * 2 本の指でつまむと 1 時間あたりの高さが変わり、時間軸が縦に伸び縮みする。
 * ただし画面の外に下書きが置かれたとき（追加ボタンから来たとき）は、その枠が見える所まで送る。
 * 空いている所をタップ・ドラッグすると、その時間帯を選んで予定を追加できる（`use-time-drag.ts`）。
 * 選んだ枠は、枠そのものをドラッグすると長さを保ったまま動き（週表示では左右に動かすと別の日へ移る）、
 * 端の丸をつまむと開始・終了だけが動く。
 */
export function TimeGrid({
  days,
  timedByDate,
  hourHeight,
  onZoom,
  gutterWidth,
  onSelectItem,
  draft,
  draftUserId,
  onChangeDraft,
}: Props) {
  const colorFor = useUserColor();
  // 下書きをつまんで直せるのはスマホのとき。PC は下書きに寄せた吹き出し（モーダル）が前に出て枠に触れない
  const compact = useIsMobile();
  const drag = useTimeDrag({ hourHeight, onChange: onChangeDraft });
  const pinch = usePinch(onZoom);
  const timedDraft = draft?.allDay === false ? draft : null;
  // 枠を置く列。スワイプで別の週・日へ移ったあとなど、表示していない日の下書きは出さない
  const draftCol = timedDraft ? days.indexOf(timedDraft.date) : -1;
  const now = useNow();
  const nowMin = minutesOfDay(now);
  const todayStr = today(now);

  const scrollRef = useRef<HTMLDivElement>(null);
  // 合わせるのは描画前（0 時からスクロールする様子を見せない。表示を切り替えたときは、
  // View Transition が新しい位置を測るより先にここで合わせておく）
  // biome-ignore lint/correctness/useExhaustiveDependencies: 最初に出したときだけ合わせる
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = days.includes(todayStr) ? (nowMin / 60) * hourHeight - 120 : 7 * hourHeight;
    el.scrollTop = Math.max(0, target);
  }, []);

  // 伸び縮みしたら、画面の真ん中に見えていた時刻をそのままの位置に残す（描画前に合わせて、
  // 伸びた時間軸が一瞬ずれて見えないようにする）。上端を固定すると、拡げるたびに
  // 見ていた時間帯が下へ流れていく。3 面とも同じ高さで同じだけ動くので、縦位置は揃ったままになる
  const drawn = useRef(hourHeight);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const middle = el.scrollTop + el.clientHeight / 2;
    el.scrollTop = (middle * hourHeight) / drawn.current - el.clientHeight / 2;
    drawn.current = hourHeight;
  }, [hourHeight]);

  // 画面の外に枠が置かれたら（追加ボタンから来たとき）見える所まで送る。
  // 始まりが見えているなら動かさない（なぞって選んでいる最中にグリッドが動くと狙いがずれる）
  const draftStart = timedDraft?.startMin ?? null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 送るのは枠が移ったときだけ（高さが変わったときは上の効果が受け持つ）
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || draftStart === null) return;
    const top = (draftStart / 60) * hourHeight;
    if (top >= el.scrollTop && top <= el.scrollTop + el.clientHeight - hourHeight) return;
    el.scrollTo({ top: Math.max(0, top - 120), behavior: 'smooth' });
  }, [draftStart]);

  return (
    <Box
      {...syncScrollProps}
      {...pinch}
      ref={scrollRef}
      sx={{ flexGrow: 1, minHeight: 0, overflowY: 'auto' }}
    >
      <Box
        data-time-grid
        sx={{
          display: 'grid',
          gridTemplateColumns: `${gutterWidth}px repeat(${days.length}, minmax(0, 1fr))`,
          height: hourHeight * 24,
          position: 'relative',
        }}
      >
        <Box sx={{ gridColumn: 1, gridRow: 1, position: 'relative' }}>
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
        {days.map((day, i) => (
          <Box
            key={day}
            data-date={day}
            {...drag.props}
            sx={{
              // どの子も置く場所を明示する。下書きの枠が列に重なれるようにするため
              // （1 つでも自動配置のままだと、枠に取られた列を避けて次の行へ送られる）
              gridColumn: i + 2,
              gridRow: 1,
              position: 'relative',
              borderLeft: 1,
              borderColor: 'divider',
              // 1 時間ごとの横罫線。CSS 変数テーマなので divider は t.vars 側から取る
              // （t.palette はライト固定の値で、ダークでは黒い線になって背景に沈む）
              backgroundImage: (t) => {
                const line = (t.vars ?? t).palette.divider;
                return `repeating-linear-gradient(to bottom, transparent 0, transparent ${hourHeight - 1}px, ${line} ${hourHeight - 1}px, ${line} ${hourHeight}px)`;
              },
            }}
          >
            {(timedByDate.get(day) ?? []).map((p) => (
              <TimedBlock
                key={p.key}
                placed={p}
                hourHeight={hourHeight}
                colors={colorFor(colorUserOf(p.item.participantIds))}
                onClick={() => onSelectItem(p.item)}
              />
            ))}
            {day === todayStr && <NowLine top={(nowMin / 60) * hourHeight} />}
          </Box>
        ))}
        {/*
          枠は列の中ではなく、列に重ねて置く。日が変わっても同じ要素のまま列を移るので、
          つまんだ指を離さずに隣の日へ持っていける（列の中に置くと日ごとに要素が入れ替わり、
          掴んでいた要素が DOM から消えた時点でタッチが途切れて横スワイプに化ける）
        */}
        {timedDraft && draftCol >= 0 && (
          <DraftBlock
            draft={timedDraft}
            column={draftCol + 1}
            hourHeight={hourHeight}
            colors={colorFor(draftUserId)}
            grab={
              compact
                ? {
                    move: drag.moveProps(timedDraft),
                    start: drag.resizeProps('start', timedDraft),
                    end: drag.resizeProps('end', timedDraft),
                  }
                : null
            }
          />
        )}
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
        // 表示を切り替えたとき、同じ項目がこのブロックから動く
        viewTransitionName: itemTransitionName(item),
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
