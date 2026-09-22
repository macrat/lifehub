import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { DateString } from '../../../../shared/types.ts';
import { formatTime, minutesOfDay, today } from '../../../lib/date.ts';
import { useIsMobile } from '../../../lib/ui/use-breakpoint.ts';
import { useNow } from '../../../lib/use-now.ts';
import { type ItemColors, useUserColor } from '../../users/use-user-color.ts';
import { type Draft, sameOccurrence } from '../draft.ts';
import { type CalendarItem, colorUserOf } from '../queries.ts';
import type { DragHandlers } from '../use-range-drag.ts';
import { useTimeDrag } from '../use-time-drag.ts';
import { DraftBlock } from './DraftBlock.tsx';
import { itemTransitionName } from './item-transition.ts';
import { syncScrollProps } from './SwipePager.tsx';
import type { TimedPlaced } from './timeline-layout.ts';

type Props = {
  days: DateString[];
  /** 日ごとの時間指定の項目（列の割り当て済み） */
  timedByDate: Map<DateString, TimedPlaced<CalendarItem>[]>;
  hourHeight: number;
  gutterWidth: number;
  onSelectItem: (item: CalendarItem) => void;
  /** 追加・編集しようとしている予定の枠（時間指定のものだけここに出す） */
  draft: Draft | null;
  /** 枠の色を決めるユーザー（選んでいる参加者から決まる。`colorUserOf`） */
  draftUserId: string | null;
  /** なぞって時間帯を決めたとき。done はポインタを離したか */
  onChangeDraft: (draft: Draft, done: boolean) => void;
};

/**
 * 0〜24 時の時間軸。縦にスクロールし、時間指定の項目を開始〜終了の高さで置く。今日の列には現在時刻の線。
 * 縦の位置を合わせるのは最初に出したときだけ（今日を含むなら現在時刻の少し上、それ以外は 7 時）。
 * 日付を移っても保つので、スワイプの前後でも見ていた時間帯がそのまま残る。
 * ただし画面の外に下書きが置かれたとき（追加ボタンから来たとき）は、その枠が見える所まで送る。
 * 空いている所をタップ・ドラッグすると、その時間帯を選んで予定を追加できる（`use-time-drag.ts`）。
 * 枠は、枠そのものをドラッグすると長さを保ったまま動き（週表示では左右に動かすと別の日へ移る）、
 * 端の丸をつまむと開始・終了だけが動く。
 * 保存済みの予定は長押しでつまむと編集モードに入り、同じ指のまま枠として動かせる。
 */
export function TimeGrid({
  days,
  timedByDate,
  hourHeight,
  gutterWidth,
  onSelectItem,
  draft,
  draftUserId,
  onChangeDraft,
}: Props) {
  const colorFor = useUserColor();
  // 下書きをつまんで直せるのはスマホのとき。PC は下書きに寄せた吹き出し（モーダル）が前に出て枠に触れない
  const compact = useIsMobile();
  const drag = useTimeDrag({ hourHeight, draft, onChange: onChangeDraft });
  const timedDraft = draft?.range.allDay === false ? draft.range : null;
  // 枠を置く列。スワイプで別の週・日へ移ったあとなど、表示していない日の枠は出さない
  const draftCol = timedDraft ? days.indexOf(timedDraft.date) : -1;
  // 編集中の予定は枠で出すので、元のブロックは隠す（枠を出せているときだけ。終日に変えたなど
  // 枠が出ない間は、保存するまで元の時間帯に見えているほうが分かりやすい）
  const editing = draftCol >= 0 ? draft?.item : null;
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
  }, [hourHeight]);

  // 画面の外に枠が置かれたら（追加ボタンから来たとき）見える所まで送る。
  // 始まりが見えているなら動かさない（なぞって選んでいる最中にグリッドが動くと狙いがずれる）
  const draftStart = timedDraft?.startMin ?? null;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || draftStart === null) return;
    const top = (draftStart / 60) * hourHeight;
    if (top >= el.scrollTop && top <= el.scrollTop + el.clientHeight - hourHeight) return;
    el.scrollTo({ top: Math.max(0, top - 120), behavior: 'smooth' });
  }, [draftStart, hourHeight]);

  return (
    <Box {...syncScrollProps} ref={scrollRef} sx={{ flexGrow: 1, minHeight: 0, overflowY: 'auto' }}>
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
                hidden={sameOccurrence(editing, p.item)}
                onClick={() => onSelectItem(p.item)}
                // 予定は長押しでつまんで編集モードに入れる（スマホだけ。PC は吹き出しが前に出るので詳細から直す）
                grab={compact ? drag.grabItemProps(p.item) : undefined}
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
            grab={compact ? drag.frameProps(timedDraft) : null}
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

/**
 * 時間軸に置く 1 項目。タップで詳細、長押しでつまんで編集モード（`grab`）。
 * 編集中は枠（`DraftBlock`）で出すので隠すが、DOM からは消さない: 長押しでつまんだ要素が
 * 消えるとその場でタッチが途切れ、指を離さずに動かせなくなる（横スワイプに化ける）。
 */
function TimedBlock({
  placed,
  hourHeight,
  colors,
  hidden,
  onClick,
  grab,
}: {
  placed: TimedPlaced<CalendarItem>;
  hourHeight: number;
  colors: ItemColors;
  /** 編集中（枠で出している）か */
  hidden: boolean;
  onClick: () => void;
  /** 長押しでつまむためのハンドラ。つまめないとき（PC・タスク）は undefined */
  grab: DragHandlers | undefined;
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
      {...grab}
      onClick={hidden ? undefined : onClick}
      aria-label={item.title}
      sx={{
        position: 'absolute',
        // 隠すのは見た目だけ（場所は残す）。display: none にすると掴んだ指が離れてしまう
        visibility: hidden ? 'hidden' : undefined,
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
