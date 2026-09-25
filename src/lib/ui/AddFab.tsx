import AddIcon from '@mui/icons-material/Add';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import { FAB_SX } from './layout.ts';

/**
 * 右下の追加ボタン（種類を選ばない画面: 立替・レモン）。ボタンそのものはスクワークルに切り抜く
 * （テーマの MuiFab）ので、影は外側の箱（`FAB_SX`）が持つ。
 * 種類を選ぶ画面（ホーム・カレンダー）は `AddMenu`。
 */
export function AddFab({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Box sx={FAB_SX}>
      <Fab color="primary" aria-label={label} onClick={onClick}>
        <AddIcon />
      </Fab>
    </Box>
  );
}
