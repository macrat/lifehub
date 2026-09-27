import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import type { SxProps, Theme } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { mergeSx } from './merge-sx.ts';
import { useRecordPress } from './use-record-press.ts';

const ROOT_SX = { position: 'relative' } as const;

/** 行の下の区切り線 */
const DIVIDER_SX = { position: 'relative', borderBottom: 1, borderColor: 'divider' } as const;

/**
 * 押せる範囲。行全体に広げ、中身は左から詰める。
 * 行は枠線も背景も持たず見た目の上で形が無いので、押したときの色（波紋）も角を丸めず端から端まで出す
 */
const BUTTON_SX = {
  width: '100%',
  justifyContent: 'flex-start',
  textAlign: 'left',
} as const;

/**
 * 操作できる印（control）を重ねる層。押せる範囲とぴったり同じ大きさで重ね、同じ並べ方（layoutSx）で
 * 印の枠を置くので、枠は押せる範囲の中の枠とちょうど同じ位置に来る。
 * 層そのものは押せないようにして、層の中の印だけを押せるようにする（印の外は下の行を押したことになる）
 */
const OVERLAY_SX = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  pointerEvents: 'none',
} as const;

const CONTROL_SX = { '& > *': { pointerEvents: 'auto' } } as const;

/**
 * 記録 1 件を出す一覧の行の骨組み。印（あれば）を含む行全体を押せる範囲にし、どこを押しても行全体に波紋が広がる。
 * 単押しは閲覧、長押しは編集（`useRecordPress`）。
 * ホームのタイムライン（`TimelineRow`）・リスト表示の行（`MarkedRow`）・レモンの記録の一覧（`CareLogList`）が
 * 同じ押し方になるよう、ここ 1 か所に置く。
 *
 * 左に印を置く行は markSx で印の枠を決め、見せるだけの印は mark に、操作できる印（タスクの完了のチェックボックス）は
 * control に渡す（どちらか一方）。ボタンの中にボタンは入れられないので、control のときは押せる範囲の中の枠を空けておき、
 * その上に同じ並べ方の層を重ねて印を置く。印を押せば印の操作になり、それ以外を押せば行が開いて、
 * 波紋は印の下まで広がる。
 */
/**
 * 印の渡し方。印（mark・control）を渡すなら、その枠（markSx）も要る。
 * 枠が無いと印を置く場所が無く、黙って消えたり位置がずれたりするので、型で組み合わせを強いる
 */
type MarkProps =
  | {
      /** 印の枠。行をまたいで中身の左端が揃うよう、幅を決め打ちにする */
      markSx: SxProps<Theme>;
      /** 印（見せるだけのもの）。押すと行を押したことになる */
      mark?: ReactNode;
      /** 操作できる印。行の上に重ねて置き、押すとその操作になる */
      control?: ReactNode;
    }
  | { markSx?: undefined; mark?: undefined; control?: undefined };

export function PressableRow({
  onSelect,
  mark,
  control,
  markSx,
  layoutSx,
  divider = false,
  sx,
  children,
}: MarkProps & {
  /** 押されたとき。editing は長押し（編集で開く）か */
  onSelect: (editing: boolean) => void;
  /** 中身の並べ方（余白・揃え・間隔）。操作できる印の層も同じ並べ方にする */
  layoutSx: SxProps<Theme>;
  /** 行の下に区切り線を引く */
  divider?: boolean;
  /** 行全体の体裁（完了した行を薄くする、View Transition の名前） */
  sx?: SxProps<Theme>;
  children: ReactNode;
}) {
  const press = useRecordPress(onSelect);
  return (
    <Box sx={mergeSx(divider ? DIVIDER_SX : ROOT_SX, sx)}>
      <ButtonBase {...press} sx={mergeSx(BUTTON_SX, layoutSx)}>
        {markSx && <Box sx={markSx}>{mark}</Box>}
        {children}
      </ButtonBase>
      {control && (
        <Box sx={mergeSx(OVERLAY_SX, layoutSx)}>
          <Box sx={mergeSx(markSx, CONTROL_SX)}>{control}</Box>
        </Box>
      )}
    </Box>
  );
}
