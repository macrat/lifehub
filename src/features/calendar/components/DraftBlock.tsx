import Box from '@mui/material/Box';
import { alpha, type Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import type { DateString } from '../../../../shared/types.ts';
import { formatMinutesOfDay } from '../../../lib/date.ts';
import type { draftColumns, EventDraft, TimePoint } from '../draft.ts';
import type { DragHandlers } from '../use-range-drag.ts';

/** つまむ丸の大きさ（px）。枠の上下の線には重ねて置き、左右は枠の内側に入れる */
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
  // 枠は見せるだけ。押した先は下のセル・列に届かせ、そこから選び直せるようにする
  pointerEvents: 'none',
} as const;

/** 選んでいる時間帯（週・日の時間軸）。端の丸をつまむと開始・終了を変えられる */
export function DraftBlock({
  draft,
  hourHeight,
  handleProps,
}: {
  draft: EventDraft & { allDay: false };
  hourHeight: number;
  /** 端をつまんで調整できるとき（タッチ）。anchor は動かさない方の端 */
  handleProps: ((anchor: TimePoint) => DragHandlers) | null;
}) {
  const { date, startMin, endMin } = draft;
  return (
    <Box
      data-draft
      sx={{
        ...OUTLINE,
        position: 'absolute',
        top: (startMin / 60) * hourHeight + 1,
        height: ((endMin - startMin) / 60) * hourHeight - 2,
        left: 1,
        right: 2,
        px: 0.5,
      }}
    >
      {/* 時刻は丸と重なるので、つまむ丸を出さない PC でだけ（ドラッグ中の目印として）添える */}
      {handleProps ? (
        <>
          <Handle
            end="start"
            position={{ top: -DOT_SIZE / 2, left: DOT_INSET }}
            handlers={handleProps({ date, min: endMin - 1 })}
          />
          <Handle
            end="end"
            position={{ bottom: -DOT_SIZE / 2, right: DOT_INSET }}
            handlers={handleProps({ date, min: startMin })}
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

/** 選んでいる期間（月表示・終日欄）。GridChip と同じくグリッドの列と行に置く */
export function DraftBar({
  draft,
  columns,
  lane,
  handleProps,
}: {
  draft: EventDraft & { allDay: true };
  /** この並びの中で占める列（`draftColumns`）。週をまたぐ帯は週ごとに 1 本ずつ描く */
  columns: NonNullable<ReturnType<typeof draftColumns>>;
  lane: number;
  handleProps: ((anchor: DateString) => DragHandlers) | null;
}) {
  const { col, span, roundStart, roundEnd } = columns;
  const center = { top: '50%', mt: `${-DOT_SIZE / 2}px` };
  return (
    <Box
      data-draft
      sx={{
        ...OUTLINE,
        position: 'relative',
        gridColumn: `${col + 1} / span ${span}`,
        gridRow: lane + 2,
        alignSelf: 'center',
        height: '100%',
        // 続きの端は角を丸めず、帯の外にも出さない（前後の週とつながって見えるように）
        borderRadius: `${roundStart ? 4 : 0}px ${roundEnd ? 4 : 0}px ${roundEnd ? 4 : 0}px ${roundStart ? 4 : 0}px`,
        ml: roundStart ? '2px' : 0,
        mr: roundEnd ? '2px' : 0,
      }}
    >
      {handleProps && roundStart && (
        <Handle
          end="start"
          position={{ ...center, left: DOT_INSET }}
          handlers={handleProps(draft.to)}
        />
      )}
      {handleProps && roundEnd && (
        <Handle
          end="end"
          position={{ ...center, right: DOT_INSET }}
          handlers={handleProps(draft.from)}
        />
      )}
    </Box>
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
