import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import type { ErrorComponentProps } from '@tanstack/react-router';

/** ルートの読み込みや描画で例外が起きたときの表示。再読み込みで復帰できることが多い。 */
export function ErrorPage({ error, reset }: ErrorComponentProps) {
  return (
    <Box sx={{ p: 2 }}>
      <Stack spacing={2} sx={{ maxWidth: 480, mx: 'auto', mt: 4 }}>
        <Alert severity="error">
          エラーが発生しました。
          {error instanceof Error && error.message ? ` (${error.message})` : ''}
        </Alert>
        <Button variant="contained" onClick={() => reset()}>
          再試行
        </Button>
        <Button onClick={() => window.location.reload()}>再読み込み</Button>
      </Stack>
    </Box>
  );
}
