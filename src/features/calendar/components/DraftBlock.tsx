import Box from '@mui/material/Box';
import { alpha, type Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { formatMinutesOfDay } from '../../../lib/date.ts';
import type { draftColumns, TimedDraft } from '../draft.ts';
import type { DragHandlers } from '../use-range-drag.ts';

/** つまむ丸の大きさ（px）。時間軸の枠の上下の線には重ねて置き、左右は枠の内側に入れる */
const DOT_SIZE = 8;
/** 丸を枠の左右の端から離す距離（px） */
const DOT_INSET = 10;
/** 指の当たりの大きさ（px）。丸は小さく見せ、押せる範囲だけ広げる */
const TARGET_SIZE = 32;

const OUTLINE = {
  boxSizing: 'border-box',
  borderRadius: '4px',
  border: 2,
  borderColor: 'primary.main',
  bgcolor: (t: Theme) => alpha(t.palette.primary.main, 0.3),
} as const;

/**
 * 選んでいる時間帯（週・日の時間軸）。つまんで直せるときは、枠そのもので長さを保ったまま動かし
 * （左右に動かせば別の日へ移る）、端の丸で開始・終了を変える。枠がポインタを受けるので、
 * 枠の中から選び直すことはできない（選び直しは空いている所から）。
 * `DraftBar` と同じく時間軸のグリッドの直接の子で、列の中には入れない（`TimeGrid`）。
 */
export function DraftBlock({
  draft,
  column,
  hourHeight,
  grab,
}: {
  draft: TimedDraft;
  /** 時間軸のグリッドの中で重ねる列（時刻の目盛りを含めた 0 起点） */
  column: number;
  hourHeight: number;
  /** つまんで直せるとき（スマホ）。PC は吹き出しが前に出て枠に触れないので null */
  grab: { move: DragHandlers; start: DragHandlers; end: DragHandlers } | null;
}) {
  const { startMin, endMin } = draft;
  return (
    <Box
      data-draft
      {...grab?.move}
      sx={{
        ...OUTLINE,
        gridColumn: column + 1,
        gridRow: 1,
        // 行の上端から開始の分だけ下げる（列と同じ高さに伸びないよう start 揃え）
        alignSelf: 'start',
        position: 'relative',
        mt: `${(startMin / 60) * hourHeight + 1}px`,
        height: ((endMin - startMin) / 60) * hourHeight - 2,
        ml: '1px',
        mr: '2px',
        px: 0.5,
        // つまめないときは見せるだけ。押した先は下の列に届かせ、そこから選び直せるようにする
        pointerEvents: grab ? 'auto' : 'none',
        cursor: 'move',
      }}
    >
      {/* 時刻は丸と重なるので、つまむ丸を出さない PC でだけ（ドラッグ中の目印として）添える */}
      {grab ? (
        <>
          <Handle
            end="start"
            position={{ top: -DOT_SIZE / 2, left: DOT_INSET }}
            handlers={grab.start}
          />
          <Handle
            end="end"
            position={{ bottom: -DOT_SIZE / 2, right: DOT_INSET }}
            handlers={grab.end}
          />
        </>
      ) : (
        <Typography component="div" sx={{ fontSize: '0.65rem', fontWeight: 600, lineHeight: 1.25 }}>
          {formatMinutesOfDay(startMin)}〜{formatMinutesOfDay(endMin)}
        </Typography>
      )}
    </Box>
  );
}

/**
 * 選んでいる期間の帯（月表示は終日・時間指定のどちらも、週・日の終日欄は終日のみ）。
 * GridChip と同じくグリッドの列と行に置く。
 * 月・週・日のどこでも同じ見た目で、つまむ丸は出さない（行が低く、丸が日付や項目に重なって窮屈になる）。
 * 直すのは下のセルを長押ししてから: 最初の日の左半分・最後の日の右半分で端、中ほどで帯ごと動かす
 * （`use-day-drag.ts`）。
 */
export function DraftBar({
  columns,
  lane,
}: {
  /** この並びの中で占める列（`draftColumns`）。週をまたぐ帯は週ごとに 1 本ずつ描く */
  columns: NonNullable<ReturnType<typeof draftColumns>>;
  lane: number;
}) {
  const { col, span, roundStart, roundEnd } = columns;
  return (
    <Box
      data-draft
      sx={{
        ...OUTLINE,
        // 帯は見せるだけ。押した先は下のセルに届かせ、そこから掴んだり選び直したりできるようにする
        pointerEvents: 'none',
        gridColumn: `${col + 1} / span ${span}`,
        gridRow: lane + 2,
        alignSelf: 'center',
        height: '100%',
        // 続きの端は角を丸めず、帯の外にも出さない（前後の週とつながって見えるように）
        borderRadius: `${roundStart ? 4 : 0}px ${roundEnd ? 4 : 0}px ${roundEnd ? 4 : 0}px ${roundStart ? 4 : 0}px`,
        ml: roundStart ? '2px' : 0,
        mr: roundEnd ? '2px' : 0,
      }}
    />
  );
}

/** 下書きの端をつまむ丸。見た目と指の当たりだけの部品で、正確な指定は全項目のフォームで行う */
function Handle({
  end,
  position,
  handlers,
}: {
  end: 'start' | 'end';
  position: Record<string, number | string>;
  handlers: DragHandlers;
}) {
  return (
    <Box
      data-handle={end}
      {...handlers}
      sx={{
        ...position,
        position: 'absolute',
        width: DOT_SIZE,
        height: DOT_SIZE,
        borderRadius: '50%',
        bgcolor: 'primary.main',
        pointerEvents: 'auto',
        touchAction: 'none',
        // 指の当たりは丸より広く取る。丸を枠の端から離してあるので、横に広げても枠からはみ出さない
        // （時間軸は overflow-y: auto の中にあり、右にはみ出すと横にスクロールできてしまう）
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: -(TARGET_SIZE - DOT_SIZE) / 2,
        },
      }}
    />
  );
}
