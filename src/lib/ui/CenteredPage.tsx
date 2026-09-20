import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import type { ReactNode } from 'react';

/** ログイン・同意画面のような、中央に 1 枚のカードだけを置くページ */
export function CenteredPage({ maxWidth, children }: { maxWidth: number; children: ReactNode }) {
  return (
    <Box
      sx={{
        minHeight: '100dvh',
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
