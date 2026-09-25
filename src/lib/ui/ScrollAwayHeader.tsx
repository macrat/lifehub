import Box from '@mui/material/Box';
import type { ReactNode, Ref } from 'react';
import { STICKY_TOP } from './layout.ts';

/**
 * 一覧の上に貼り付け、下へスクロールすると AppBar の裏へ隠れ、少し上へ戻すとまた出てくる帯
 * （MUI の「Hide App Bar」と同じ見せ方）。一覧を読み進める間は場所を譲り、上へ戻す指の動きだけで呼び戻せる。
 * いつ隠すか（スクロールの向きの見方）は一覧ごとに違うので、使う側が決めて hidden で渡す。
 * 隠すのは transform だけで、流れの中の位置は変えない（隠れても一覧が跳ねない）。
 */
export function ScrollAwayHeader({
  hidden,
  ref,
  children,
}: {
  hidden: boolean;
  ref?: Ref<HTMLDivElement>;
  children: ReactNode;
}) {
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
