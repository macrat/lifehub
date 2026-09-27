import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { DATE_HEADING_INSET } from './layout.ts';
import { PressableRow } from './PressableRow.tsx';

/**
 * 印の枠。幅は呼び出し側が決め打ちにして（`markWidth`）、行をまたいで印と主列の左端が揃うようにする。
 * 幅は印の形で違う（押せるチェックボックスを重ねる予定と、見せるだけの小さなベン図の立替）ので、ここでは持たない
 */
const MARK_SX = {
  alignSelf: 'stretch',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
} as const;

/**
 * 行の並べ方。枠線も背景も持たず、押したときだけ薄く色が付く。
 * 左右の余白は日付の見出し（`DateHeading`）と同じにして、見出しと印の左端を揃える
 */
const LAYOUT_SX = {
  alignItems: 'center',
  py: 0.75,
  px: DATE_HEADING_INSET,
  gap: 1.5,
} as const;

/**
 * 主列。折り返さず桁を揃えるので、時刻も金額も行をまたいで縦に読める。
 * 幅は呼び出し側が決める（時刻と金額で必要な幅が違う）。
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
 * 押し方（印を含む行全体が押せる範囲、操作できる印は重ねて置く）は `PressableRow` が決める。
 *
 * カレンダーのリスト表示（`ItemCard`）・立替の履歴（`ExpenseList`）が
 * 同じ形で並ぶよう、行の骨組み（列の順と間隔）はここ 1 か所に置く。中身と、印・主列の幅は画面ごとに違うので
 * 呼び出し側が決める（一方の画面の都合で他方の列の幅が変わらないようにする）。
 */
export function MarkedRow({
  mark,
  control,
  markWidth,
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
  /** 印の枠の幅（px）。印が収まる幅を呼び出し側が決める */
  markWidth: number;
  lead: ReactNode;
  /**
   * 主列の幅（px）。揃えたい値が収まる幅を呼び出し側が決める。省くと中身の幅になるので、
   * 行をまたいで揃えるには中身の側で幅を揃える（`ExpenseList` は一番幅を取る金額を透明に重ねる）
   */
  leadWidth?: number;
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
      markSx={{ ...MARK_SX, width: markWidth }}
      layoutSx={LAYOUT_SX}
      sx={sx}
    >
      <Box sx={{ ...LEAD_SX, width: leadWidth }}>{lead}</Box>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>{children}</Box>
    </PressableRow>
  );
}
