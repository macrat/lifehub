import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import type { SxProps, Theme } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { useRecordPress } from './use-record-press.ts';

/**
 * 記録の一覧（立替・レモン）の 1 行。単押しは閲覧、長押しは編集（`useRecordPress`）。
 * 中身は呼び出し側が並べ、ここは押し分けと行の体裁（区切り線・押せる範囲）だけを持つ。
 * 部品にするのはフックを行ごとに呼ぶため（一覧の map の中では呼べない）で、
 * 一覧はどれも同じ入れ物を使う。
 */
export function RecordListRow({
  onSelect,
  sx,
  children,
}: {
  /** 押されたとき。editing は長押し（編集で開く）か */
  onSelect: (editing: boolean) => void;
  /** 中身の並べ方（列の組み方など）。行の体裁はここが持つ */
  sx?: SxProps<Theme>;
  children: ReactNode;
}) {
  const press = useRecordPress(onSelect);
  return (
    <ListItem divider disablePadding>
      <ListItemButton {...press} sx={sx}>
        {children}
      </ListItemButton>
    </ListItem>
  );
}
