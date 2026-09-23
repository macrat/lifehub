import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { isCompletedTask } from '../../../../shared/calendar.ts';
import { DAY_MINUTES } from '../../../../shared/constants.ts';
import { today } from '../../../../shared/date.ts';
import type { DateString } from '../../../../shared/types.ts';
import { formatTime, minutesOfDay } from '../../../lib/date.ts';
import { useIsMobile } from '../../../lib/ui/use-breakpoint.ts';
import { useNow } from '../../../lib/use-now.ts';
import { COMPLETED_SX, COMPLETED_TITLE_SX } from '../../events/components/completed-style.ts';
import { useUserColor } from '../../users/use-user-color.ts';
import { type Draft, sameOccurrence } from '../draft.ts';
import { type CalendarItem, colorUserOf } from '../queries.ts';
import type { GridDraft } from '../use-event-composer.ts';
import { atMinute, HOUR_HEIGHT_VAR } from '../use-hour-zoom.ts';
import { usePinch } from '../use-pinch.ts';
import type { DragHandlers } from '../use-range-drag.ts';
import { useTimeDrag } from '../use-time-drag.ts';
import { useTimelineScroll } from '../use-timeline-scroll.ts';
import { DraftBlock } from './DraftBlock.tsx';
import { itemTransitionName } from './item-transition.ts';
import { syncScrollProps } from './markers.ts';
import { type TimedPlaced, timedSpan } from './timeline-layout.ts';

/** ブロックの中の時刻の行。高さが足りるときだけ出す（下の `@container`） */
const TIME_LINE = 'time-line';

type Props = {
  days: DateString[];
  /** 日ごとの時間指定の項目（列の割り当て済み） */
  timedByDate: Map<DateString, TimedPlaced<CalendarItem>[]>;
  /** 1 時間あたりの高さ（px）。つまむと変わる（`use-hour-zoom.ts`）。
   * 寸法は CSS 変数から引くので、この数を使うのはスクロール位置を測る所だけ */
  hourHeight: number;
  /** つまんで拡げ縮めしたとき。直前からの倍率 */
  onZoom: (ratio: number) => void;
  gutterWidth: number;
  onSelectItem: (item: CalendarItem) => void;
  /**
   * 追加・編集しようとしている予定の枠（時間指定のものだけここに出す）。
   * なぞり終えるまで（`settled`）は枠を追いかけてスクロールしない
   */
  draft: GridDraft | null;
  /** なぞって時間帯を決めたとき。done はポインタを離したか */
  onChangeDraft: (draft: Draft, done: boolean) => void;
  /** 最初に出したとき、予定がなるべく全部見える縦位置に合わせるか（月表示から来たとき） */
  fitItems: boolean;
  /** クイック入力のシートが下から覆っている高さ（px）。下に同じだけ余白を足す */
  bottomInset: number;
};

/**
 * 0〜24 時の時間軸。縦にスクロールし、時間指定の項目を開始〜終了の高さで置く。今日の列には現在時刻の線。
 * 縦の位置の合わせ方は `useTimelineScroll`。
 * 2 本の指でつまむと 1 時間あたりの高さが変わり、時間軸が縦に伸び縮みする。
 * 高さはグリッドに CSS 変数（`--hour-height`）で置くだけで、目盛り・罫線・ブロック・枠の寸法は
 * すべてそこからの calc で決まる。伸び縮みで動く値は 1 つなので、指に合わせて何十もの
 * 寸法を組み直したり、その数だけ使い捨ての CSS を作ったりしない。
 * シートが下から覆う分（`bottomInset`）は下に余白として足すので、
 * 覆われた夜の時間帯もスクロールすれば見られる（1 時間の高さは変えない）。
 * 空いている所をタップ・ドラッグすると、その時間帯を選んで予定を追加できる（`use-time-drag.ts`）。
 * 枠は、枠そのものをドラッグすると長さを保ったまま動き（週表示では左右に動かすと別の日へ移る）、
 * 端の丸をつまむと開始・終了だけが動く。
 * 保存済みの予定は長押しでつまむと編集モードに入り、同じ指のまま枠として動かせる。
 */
export function TimeGrid({
  days,
  timedByDate,
  hourHeight,
  onZoom,
  gutterWidth,
  onSelectItem,
  draft,
  onChangeDraft,
  fitItems,
  bottomInset,
}: Props) {
  // 下書きをつまんで直せるのはスマホのとき。PC は下書きに寄せた吹き出し（モーダル）が前に出て枠に触れない
  const compact = useIsMobile();
  const drag = useTimeDrag({ draft, onChange: onChangeDraft });
  const pinch = usePinch(onZoom);
  const timedDraft = draft?.range.allDay === false ? draft.range : null;
  // 枠を置く列。スワイプで別の週・日へ移ったあとなど、表示していない日の枠は出さない
  const draftCol = timedDraft ? days.indexOf(timedDraft.date) : -1;
  // 編集中の予定は枠で出すので、元のブロックは隠す（枠を出せているときだけ。終日に変えたなど
  // 枠が出ない間は、保存するまで元の時間帯に見えているほうが分かりやすい）
  const editing = draftCol >= 0 ? draft?.item : null;
  const now = useNow();
  const nowMin = minutesOfDay(now);
  const todayStr = today(now);
  const scrollRef = useTimelineScroll({
    nowMinutes: days.includes(todayStr) ? nowMin : null,
    itemsSpan: fitItems ? timedSpan(timedByDate) : null,
    hourHeight,
    draftStart: timedDraft?.startMin ?? null,
    settled: draft?.settled ?? false,
    bottomInset,
  });

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
          [HOUR_HEIGHT_VAR]: `${hourHeight}px`,
          display: 'grid',
          gridTemplateColumns: `${gutterWidth}px repeat(${days.length}, minmax(0, 1fr))`,
          height: atMinute(DAY_MINUTES),
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
                top: `calc(${atMinute(h * 60)} - 7px)`,
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
                const hour = `var(${HOUR_HEIGHT_VAR})`;
                return `repeating-linear-gradient(to bottom, transparent 0, transparent calc(${hour} - 1px), ${line} calc(${hour} - 1px), ${line} ${hour})`;
              },
            }}
          >
            {(timedByDate.get(day) ?? []).map((p) => (
              <TimedBlock
                key={p.key}
                placed={p}
                hidden={sameOccurrence(editing, p.item)}
                onClick={() => onSelectItem(p.item)}
                // 予定は長押しでつまんで編集モードに入れる（スマホだけ。PC は吹き出しが前に出るので詳細から直す）
                grab={compact ? drag.grabItemProps(p.item) : undefined}
              />
            ))}
            {day === todayStr && <NowLine minutes={nowMin} />}
          </Box>
        ))}
        {/*
          枠は列の中ではなく、列に重ねて置く。日が変わっても同じ要素のまま列を移るので、
          つまんだ指を離さずに隣の日へ持っていける（列の中に置くと日ごとに要素が入れ替わり、
          掴んでいた要素が DOM から消えた時点でタッチが途切れて横スワイプに化ける）
        */}
        {draft && timedDraft && draftCol >= 0 && (
          <DraftBlock
            draft={timedDraft}
            column={draftCol + 1}
            participantIds={draft.participantIds}
            grab={compact ? drag.frameProps(timedDraft) : null}
          />
        )}
      </Box>
      {/* シートが覆う分の余白。1 時間の高さは変えずに、隠れた時間帯まで下りられるようにする */}
      <Box sx={{ height: bottomInset }} />
    </Box>
  );
}

function NowLine({ minutes }: { minutes: number }) {
  return (
    <Box
      sx={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: atMinute(minutes),
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
  hidden,
  onClick,
  grab,
}: {
  placed: TimedPlaced<CalendarItem>;
  /** 編集中（枠で出している）か */
  hidden: boolean;
  onClick: () => void;
  /** 長押しでつまむためのハンドラ。つまめないとき（PC・タスク）は undefined */
  grab: DragHandlers | undefined;
}) {
  const { item, startMin, endMin, col, cols } = placed;
  const isTask = item.kind === 'task';
  const completed = isCompletedTask(item);
  const colors = useUserColor()(colorUserOf(item.participantIds));
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
        top: `calc(${atMinute(startMin)} + 1px)`,
        // 短い予定でもタイトルが読める高さを残す
        height: `calc(max(${atMinute(endMin - startMin)}, 18px) - 2px)`,
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
        ...(completed && { ...COMPLETED_SX, ...COMPLETED_TITLE_SX }),
        '&:hover': { filter: 'brightness(0.95)' },
        // 時刻の行は入るときだけ出す（切れた行を見せない）。入るかどうかは描かれた高さそのもので
        // 決まるので、つまんで伸び縮みしてもブラウザが決め直す。JS に高さの数を持たせない
        containerType: 'size',
        [`& .${TIME_LINE}`]: { display: 'none' },
        '@container (min-height: 34px)': { [`& .${TIME_LINE}`]: { display: 'block' } },
      }}
    >
      <Typography
        component="div"
        sx={{ fontSize: '0.72rem', fontWeight: 600, lineHeight: 1.25, overflowWrap: 'anywhere' }}
      >
        {isTask && (completed ? '☑ ' : '☐ ')}
        {item.title}
      </Typography>
      {item.kind === 'event' && (
        <Typography
          component="div"
          className={TIME_LINE}
          sx={{ fontSize: '0.65rem', lineHeight: 1.2, opacity: 0.9 }}
        >
          {formatTime(item.startsAt)}〜{formatTime(item.endsAt)}
        </Typography>
      )}
    </ButtonBase>
  );
}
