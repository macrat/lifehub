import Box from '@mui/material/Box';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import type { SxProps, Theme } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { useRecordPress } from './use-record-press.ts';

/** 帯を立てる行。左の余白は帯が使い、帯と中身の間は元の余白と同じだけ空ける */
const ACCENT_ROW_SX = { pl: 0, gap: 2, alignItems: 'stretch' } as const;

/**
 * 左端の帯。上下の余白を負のマージンで打ち消して行の高さいっぱいに伸ばし、
 * 区切り線まで届かせる（余白の内側に収めると帯が浮いて見える）。
 */
const ACCENT_SX = { width: 6, flexShrink: 0, my: -1 } as const;

/**
 * 記録の一覧（立替・レモン）の 1 行。単押しは閲覧、長押しは編集（`useRecordPress`）。
 * 中身は呼び出し側が並べ、ここは押し分けと行の体裁（区切り線・押せる範囲・左端の帯）だけを持つ。
 * 部品にするのはフックを行ごとに呼ぶため（一覧の map の中では呼べない）で、
 * 一覧はどれも同じ入れ物を使う。
 */
export function RecordListRow({
  onSelect,
  accent,
  sx,
  children,
}: {
  /** 押されたとき。editing は長押し（編集で開く）か */
  onSelect: (editing: boolean) => void;
  /** 左端に立てる帯の塗り（CSS の background。1 色でもグラデーションでもよい）。省略すると帯は出ない */
  accent?: string;
  /** 中身の並べ方（列の組み方など）。行の体裁はここが持つ */
  sx?: SxProps<Theme>;
  children: ReactNode;
}) {
  const press = useRecordPress(onSelect);
  return (
    <ListItem divider disablePadding>
      <ListItemButton {...press} sx={[accent !== undefined && ACCENT_ROW_SX, sx ?? false].flat()}>
        {accent !== undefined && <Box sx={ACCENT_SX} style={{ background: accent }} />}
        {children}
      </ListItemButton>
    </ListItem>
  );
}
