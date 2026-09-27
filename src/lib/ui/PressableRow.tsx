import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import type { SxProps, Theme } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { mergeSx } from './merge-sx.ts';
import { useRecordPress } from './use-record-press.ts';

const ROOT_SX = { position: 'relative' } as const;

/** 押せる範囲。行全体に広げ、中身は左から詰める */
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
 * 記録 1 件を出す一覧の行の骨組み。左に印の枠、右に中身を並べ、印を含む行全体を押せる範囲にする。
 * どこを押しても行全体に波紋が広がり、単押しは閲覧、長押しは編集（`useRecordPress`）。
 * ホームのタイムライン（`TimelineRow`）とリスト表示の行（`MarkedRow`）が同じ押し方になるよう、ここ 1 か所に置く。
 *
 * 印が操作できるもの（タスクの完了のチェックボックス）のときは control に渡す。ボタンの中にボタンは
 * 入れられないので、押せる範囲の中の印の枠は空けておき、その上に同じ並べ方の層を重ねて印を置く。
 * 印を押せば印の操作になり、それ以外を押せば行が開いて、波紋は印の下まで広がる。
 */
export function PressableRow({
  onSelect,
  mark,
  control,
  markSx,
  layoutSx,
  sx,
  children,
}: {
  /** 押されたとき。editing は長押し（編集で開く）か */
  onSelect: (editing: boolean) => void;
  /** 印（見せるだけのもの）。押すと行を押したことになる */
  mark?: ReactNode;
  /** 操作できる印。行の上に重ねて置き、押すとその操作になる */
  control?: ReactNode;
  /** 印の枠。行をまたいで中身の左端が揃うよう、幅を決め打ちにする */
  markSx: SxProps<Theme>;
  /** 中身の並べ方（余白・揃え・間隔）。操作できる印の層も同じ並べ方にする */
  layoutSx: SxProps<Theme>;
  /** 行全体の体裁（区切り線、完了した行を薄くする、View Transition の名前） */
  sx?: SxProps<Theme>;
  children: ReactNode;
}) {
  const press = useRecordPress(onSelect);
  return (
    <Box sx={mergeSx(ROOT_SX, sx)}>
      <ButtonBase {...press} sx={mergeSx(BUTTON_SX, layoutSx)}>
        <Box sx={markSx}>{control ? null : mark}</Box>
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
