import Box from '@mui/material/Box';
import useScrollTrigger from '@mui/material/useScrollTrigger';
import type { ReactNode } from 'react';
import { STICKY_TOP } from './layout.ts';

/**
 * 一覧の上に貼り付け、下へスクロールすると AppBar の裏へ隠れ、少し上へ戻すとまた出てくる帯
 * （MUI の「Hide App Bar」と同じ仕組み。スクロールの向きは `useScrollTrigger` が見る）。
 * 一覧を読み進める間は場所を譲り、上へ戻す指の動きだけで呼び戻せる。
 * 隠すのは transform だけで、流れの中の位置は変えない（隠れても一覧が跳ねない）。
 */
export function ScrollAwayHeader({
  pinned = false,
  children,
}: {
  /** 隠さずに出したままにする（中で絞り込みのフォームを開いている間など） */
  pinned?: boolean;
  children: ReactNode;
}) {
  const hidden = useScrollTrigger() && !pinned;
  return (
    <Box
      sx={{
        position: 'sticky',
        top: STICKY_TOP,
        zIndex: 1,
        bgcolor: 'background.default',
        transform: hidden ? 'translateY(-100%)' : 'none',
        transition: (t) => t.transitions.create('transform'),
      }}
    >
      {children}
    </Box>
  );
}
