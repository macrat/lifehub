import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Stack from '@mui/material/Stack';
import type { SxProps, Theme } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { useRecordPress } from './use-record-press.ts';

/** 印の枠。幅を決め打ちにして、行をまたいで印と主列の左端が揃うようにする */
const MARK_SX = {
  width: 44,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
} as const;

/** 押せる範囲（印より右のすべて）。枠線を持たず、押したときだけ薄く色が付く */
const BUTTON_SX = {
  flexGrow: 1,
  minWidth: 0,
  justifyContent: 'flex-start',
  textAlign: 'left',
  py: 0.75,
  pr: 2,
  gap: 1.5,
  borderRadius: 1,
} as const;

const BODY_SX = { flexGrow: 1, minWidth: 0 } as const;

/**
 * 印・主列・本文の 3 列で並ぶ、枠線を持たない行（Google カレンダー／ToDo リストの体裁）。
 * 左に何の色かを示す印（色の点、タスクのチェック）、その右に行ごとに揃えたい値（時刻、金額）、
 * 残り全部を本文（上にタイトル、下に補足）が取る。
 * 単押しは閲覧、長押しは編集（`useRecordPress`）。
 *
 * カレンダーのリスト表示（`ItemCard`）と立替の履歴（`ExpenseList`）が同じ形で並ぶよう、
 * 行の骨組みはここ 1 か所に置く。中身と主列の幅は呼び出し側が決める。
 */
export function MarkedRow({
  mark,
  lead,
  onSelect,
  sx,
  children,
}: {
  /** 左端の印（色の点、タスクのチェック） */
  mark: ReactNode;
  /** 印の右の列。幅は中身に持たせる（時刻と金額で必要な幅が違うため） */
  lead: ReactNode;
  /** 押されたとき。editing は長押し（編集で開く）か */
  onSelect: (editing: boolean) => void;
  /** 行全体の体裁（完了した行を薄くする、View Transition の名前） */
  sx?: SxProps<Theme>;
  /** 本文。上にタイトル、下に補足 */
  children: ReactNode;
}) {
  const press = useRecordPress(onSelect);
  return (
    <Stack direction="row" sx={[{ alignItems: 'stretch' }, sx ?? false].flat()}>
      <Box sx={MARK_SX}>{mark}</Box>
      <ButtonBase {...press} sx={BUTTON_SX}>
        {lead}
        <Box sx={BODY_SX}>{children}</Box>
      </ButtonBase>
    </Stack>
  );
}
