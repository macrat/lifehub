import Box from '@mui/material/Box';
import type { ReactNode, Ref } from 'react';
import { STICKY_TOP } from './layout.ts';
import { useScrolledDown } from './use-scrolled-down.ts';

/**
 * 一覧の上に貼り付け、下へスクロールすると AppBar の裏へ隠れ、少し上へ戻すとまた出てくる帯
 * （MUI の「Hide App Bar」と同じ見せ方）。一覧を読み進める間は場所を譲り、上へ戻す指の動きだけで呼び戻せる。
 * 向きは自分で見る（`useScrolledDown`。`useScrollTrigger` は一覧が自分で動かした分を除けない）。
 * 向きの状態はこの帯だけが持つので、向きが変わっても描き直すのは帯だけで、一覧は描き直さない。
 * 隠すのは transform だけで、流れの中の位置は変えない（隠れても一覧が跳ねない）。
 */
export function ScrollAwayHeader({
  pinned = false,
  ref,
  children,
}: {
  /** 隠さずに出したままにする（中で絞り込みのフォームを開いている間など） */
  pinned?: boolean;
  ref?: Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  const hidden = useScrolledDown() && !pinned;
  return (
    <Box
      ref={ref}
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
