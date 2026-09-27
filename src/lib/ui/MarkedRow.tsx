import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { PressableRow } from './PressableRow.tsx';

/** 印の枠。幅を決め打ちにして、行をまたいで印と主列の左端が揃うようにする */
const MARK_SX = {
  width: 44,
  alignSelf: 'stretch',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
} as const;

/** 行の並べ方。枠線も背景も持たず、押したときだけ薄く色が付く */
const LAYOUT_SX = {
  alignItems: 'center',
  py: 0.75,
  pr: 2,
  gap: 1.5,
} as const;

/**
 * 主列。折り返さず桁を揃えるので、時刻も金額も行をまたいで縦に読める。
 * 幅だけは呼び出し側が決める（時刻と金額で必要な幅が違う）。
 */
const LEAD_SX = {
  flexShrink: 0,
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
} as const;

/**
 * 印・主列・本文の 3 列で並ぶ、枠線を持たない行（Google カレンダー／ToDo リストの体裁）。
 * 左に何の色かを示す印（`VennMark`、タスクのチェック）、その右に行ごとに揃えたい値（時刻、金額）、
 * 残り全部を本文（上にタイトル、下に補足）が取る。
 * 押し方（印を含む行全体が押せる範囲、操作できる印は行と別に押せる）は `PressableRow` が決める。
 *
 * カレンダーのリスト表示（`ItemCard`）・立替の履歴（`ExpenseList`）が
 * 同じ形で並ぶよう、行の骨組みはここ 1 か所に置く。中身と主列の幅は呼び出し側が決める。
 */
export function MarkedRow({
  mark,
  control,
  lead,
  leadWidth,
  onSelect,
  sx,
  children,
}: {
  /** 印（見せるだけのもの） */
  mark?: ReactNode;
  /** 操作できる印（タスクの完了のチェックボックス） */
  control?: ReactNode;
  lead: ReactNode;
  /** 主列の幅。揃えたい値が収まる幅を呼び出し側が決める */
  leadWidth: number;
  /** 押されたとき。editing は長押し（編集で開く）か */
  onSelect: (editing: boolean) => void;
  /** 行全体の体裁（完了した行を薄くする、View Transition の名前） */
  sx?: SxProps<Theme>;
  children: ReactNode;
}) {
  return (
    <PressableRow
      onSelect={onSelect}
      mark={mark}
      control={control}
      markSx={MARK_SX}
      layoutSx={LAYOUT_SX}
      sx={sx}
    >
      <Box sx={{ ...LEAD_SX, width: leadWidth }}>{lead}</Box>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>{children}</Box>
    </PressableRow>
  );
}
