import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import type { ReactNode } from 'react';

/** ログイン・同意画面のような、中央に 1 枚のカードだけを置くページ */
export function CenteredPage({ maxWidth, children }: { maxWidth: number; children: ReactNode }) {
  return (
    <Box
      sx={{
        // AppShell と同じく svh（ブラウザの URL バーなどが最大に出ている状態の高さ）を基準にする。
        // dvh はそれらの出入りで値が変わり、読み込み直後に画面より高くなってスクロールが要る表示になる
        minHeight: '100svh',
        display: 'grid',
        placeItems: 'center',
        px: 2,
        bgcolor: 'background.default',
      }}
    >
      <Paper sx={{ p: 3, width: '100%', maxWidth }} elevation={2}>
        {children}
      </Paper>
    </Box>
  );
}
