import Box from '@mui/material/Box';
import { wedgeBackground, wedgeColorNear } from '../../../lib/ui/wedge.ts';
import type { ItemColors } from '../../users/use-user-color.ts';
import type { draftColumns, TimedDraft } from '../draft.ts';
import { atMinute } from '../use-hour-zoom.ts';
import { useParticipantColors } from '../use-participant-colors.ts';
import type { DragHandlers } from '../use-range-drag.ts';
import { LANE_ITEM_HEIGHT } from './lane-layout.ts';
import { draftProps } from './markers.ts';

/** つまむ丸の大きさ（px）。時間軸の枠の上下の線には重ねて置き、左右は枠の内側に入れる */
const DOT_SIZE = 8;
/** 丸を枠の左右の端から離す距離（px） */
const DOT_INSET = 10;
/** 指の当たりの大きさ（px）。丸は小さく見せ、押せる範囲だけ広げる */
const TARGET_SIZE = 32;

/** 枠の線の太さ（px） */
const LINE = 2;
/** 中の不透明度。下の予定や日付が透けて見える濃さ */
const FILL_OPACITY = 0.6;

/**
 * 枠の見た目。保存した予定の帯と同じく参加者の色で塗り分ける（`wedgeBackground`）ので、
 * 選んだ参加者を変えると枠も変わる。中は背景色に近い薄い色（tint）で半透明に塗り、
 * 下の予定や日付が透けて見えるようにする。線は line で不透明に描く。
 * WHY 薄い色: 帯と同じ濃さ（fill）だと、透けた下の予定の色と混ざって見分けにくい。背景色に近い色なら
 * 重なった所は下の予定が淡く（ライトでは明るく・ダークでは暗く）なり、枠の範囲が分かる。
 */
const outline = (colors: ItemColors[]) =>
  ({
    boxSizing: 'border-box',
    position: 'relative',
    isolation: 'isolate',
    borderRadius: '4px',
    border: `${LINE}px solid transparent`,
    // 中は不透明な色で塗り分けた疑似要素に opacity をかける。
    // WHY NOT 半透明の色で塗る: 3 人の塗り分けは色を重ねて描く（`wedgeBackground`）ので、色ごとに透かすと
    // 重なった所だけ下の層の色が混ざる。opacity は塗り分けた後の面全体にかかるので、何人でも同じ濃さになる。
    // WHY 疑似要素: 枠そのものに opacity をかけると、線やつまむ丸まで薄くなる。
    // z-index: -1 でつまむ丸の下に置き、isolation で枠の外へは潜らせない。
    // 線の下まで広げて（線は不透明なので見えない）、角の丸めを線の外側と揃える。
    '&::after': {
      content: '""',
      position: 'absolute',
      inset: -LINE,
      zIndex: -1,
      borderRadius: 'inherit',
      background: wedgeBackground(colors.map((c) => c.tint)),
      opacity: FILL_OPACITY,
    },
    // 線は透明な border の上に重ねた疑似要素で描き、線の内側を mask でくり抜く。
    // WHY 疑似要素: 塗り分けた線は border の色では描けず、border-image では角が丸まらない。
    // WHY NOT 背景を 2 枚重ねる（中を padding-box、線を border-box）: 塗り分けは色の数で層の数が変わり、
    // 層ごとに切り抜く範囲を並べ直すことになる。
    '&::before': {
      content: '""',
      position: 'absolute',
      inset: -LINE,
      padding: `${LINE}px`,
      borderRadius: 'inherit',
      background: wedgeBackground(colors.map((c) => c.line)),
      mask: 'linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)',
      pointerEvents: 'none',
    },
  }) as const;

/**
 * 追加・編集しようとしている時間帯の枠（週・日の時間軸）。つまんで直せるときは、枠そのもので
 * 長さを保ったまま動かし（左右に動かせば別の日へ移る）、端の丸で開始・終了を変える。
 * 枠は長押しを待たずに動き出すので、縦スクロールと横スワイプは枠の外から始める。
 * 枠がポインタを受けるので、枠の中から選び直すことはできない（選び直しは空いている所から）。
 * `DraftBar` と同じく時間軸のグリッドの直接の子で、列の中には入れない（`TimeGrid`）。
 */
export function DraftBlock({
  draft,
  column,
  participantIds,
  grab,
}: {
  draft: TimedDraft;
  /** 時間軸のグリッドの中で重ねる列（時刻の目盛りを含めた 0 起点） */
  column: number;
  /** 選んでいる参加者。枠は保存した予定の帯と同じく参加者の色で塗り分ける */
  participantIds: string[];
  /** つまんで直せるとき（スマホ）。PC は吹き出しが前に出て枠に触れないので null */
  grab: { move: DragHandlers; start: DragHandlers; end: DragHandlers } | null;
}) {
  const { startMin, endMin } = draft;
  const colors = useParticipantColors(participantIds);
  const lines = colors.map((c) => c.line);
  return (
    <Box
      {...draftProps}
      {...grab?.move}
      // ドラッグで変わる場所と大きさは sx ではなく style で渡す。
      // WHY: sx は値の組ごとに CSS の規則を作って文書に足し、消さない。15 分・1 日ずれるたびに組が変わるので、
      // なぞるほど使い捨ての規則が溜まり、そのたびに見た目の規則（塗り分けの背景など）も丸ごと作り直す。
      // style なら属性を書き換えるだけで、sx の規則は参加者の組ごとに 1 つで済む。
      style={{
        gridColumn: column + 1,
        marginTop: `calc(${atMinute(startMin)} + 1px)`,
        height: `calc(${atMinute(endMin - startMin)} - 2px)`,
      }}
      sx={{
        ...outline(colors),
        gridRow: 1,
        // 行の上端から開始の分だけ下げる（列と同じ高さに伸びないよう start 揃え）
        alignSelf: 'start',
        ml: '1px',
        mr: '2px',
        // つまめないときは見せるだけ。押した先は下の列に届かせ、そこから選び直せるようにする
        pointerEvents: grab ? 'auto' : 'none',
        // 押した時点から動かすので、ブラウザのスクロール・スワイプには渡さない
        touchAction: grab ? 'none' : undefined,
        cursor: 'move',
      }}
    >
      {grab && (
        <>
          <Handle
            end="start"
            position={{ top: -DOT_SIZE / 2, left: DOT_INSET }}
            color={wedgeColorNear(lines, 'top-left')}
            handlers={grab.start}
          />
          <Handle
            end="end"
            position={{ bottom: -DOT_SIZE / 2, right: DOT_INSET }}
            color={wedgeColorNear(lines, 'bottom-right')}
            handlers={grab.end}
          />
        </>
      )}
    </Box>
  );
}

/**
 * 選んでいる期間の帯（月表示は終日・時間指定のどちらも、週・日の終日欄は終日のみ）。
 * GridChip と同じくグリッドの列と行に置く。月・週・日のどこでも同じ見た目で、つまむ丸は出さない
 * （行が低く、丸が日付や項目に重なって窮屈になる）。直すのは下のセルの長押しから（`draft.ts` の `dayGrab`）。
 */
export function DraftBar({
  columns,
  lane,
  participantIds,
}: {
  /** この並びの中で占める列（`draftColumns`）。週をまたぐ帯は週ごとに 1 本ずつ描く */
  columns: NonNullable<ReturnType<typeof draftColumns>>;
  lane: number;
  /** 選んでいる参加者。枠は保存した予定の帯と同じく参加者の色で塗り分ける */
  participantIds: string[];
}) {
  const { col, span, roundStart, roundEnd } = columns;
  const colors = useParticipantColors(participantIds);
  return (
    <Box
      {...draftProps}
      // ドラッグで変わる場所は `DraftBlock` と同じく style で渡す（角の丸めと余白は続き方の 4 通りなので sx）
      style={{ gridColumn: `${col + 1} / span ${span}`, gridRow: lane + 2 }}
      sx={{
        ...outline(colors),
        // 帯は見せるだけ。押した先は下のセルに届かせ、そこから掴んだり選び直したりできるようにする
        pointerEvents: 'none',
        alignSelf: 'center',
        height: LANE_ITEM_HEIGHT,
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
  color,
  handlers,
}: {
  end: 'start' | 'end';
  position: Record<string, number | string>;
  /** 丸の色。置いた場所の枠の線と同じ色（`wedgeColorNear`） */
  color: string;
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
        bgcolor: color,
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
