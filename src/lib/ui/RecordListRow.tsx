import Box from '@mui/material/Box';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import type { SxProps, Theme } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { useRecordPress } from './use-record-press.ts';

/** 左端の帯の幅。中身の左の余白は、この幅のぶんだけ右へずらす */
const STRIPE_WIDTH = 6;

/**
 * 左端の帯。行の中に絶対位置で敷くので、上下の余白がいくつでも行の高さいっぱい
 * （区切り線まで）に伸び、中身の並べ方（横並びでも格子でも）にも左右されない。
 */
const STRIPE_SX = { position: 'absolute', insetBlock: 0, left: 0, width: STRIPE_WIDTH } as const;

/** 帯を立てる行。帯のぶんだけ中身の左をずらす（16px は行の既定の余白） */
const STRIPE_ROW_SX = { pl: `calc(${STRIPE_WIDTH}px + 16px)` } as const;

/**
 * 記録の一覧（立替・レモン）の 1 行。単押しは閲覧、長押しは編集（`useRecordPress`）。
 * 中身は呼び出し側が並べ、ここは押し分けと行の体裁（区切り線・押せる範囲・左端の帯）だけを持つ。
 * 部品にするのはフックを行ごとに呼ぶため（一覧の map の中では呼べない）で、
 * 一覧はどれも同じ入れ物を使う。
 */
export function RecordListRow({
  onSelect,
  stripe,
  sx,
  children,
}: {
  /** 押されたとき。editing は長押し（編集で開く）か */
  onSelect: (editing: boolean) => void;
  /** 左端に立てる帯の塗り（CSS の background。1 色でもグラデーションでもよい）。省略すると帯は出ない */
  stripe?: string;
  /** 中身の並べ方（列の組み方など）。行の体裁はここが持つ */
  sx?: SxProps<Theme>;
  children: ReactNode;
}) {
  const press = useRecordPress(onSelect);
  return (
    <ListItem divider disablePadding>
      {/* 帯があるときだけ余白をずらす。呼び出し側の sx は後ろに置いて勝たせる */}
      <ListItemButton
        {...press}
        sx={stripe === undefined ? sx : [STRIPE_ROW_SX, sx ?? false].flat()}
      >
        {/* 行ごとに変わるのは塗りだけなので、そこだけ style で渡す（sx は 1 つのまま） */}
        {stripe !== undefined && <Box sx={STRIPE_SX} style={{ background: stripe }} />}
        {children}
      </ListItemButton>
    </ListItem>
  );
}
