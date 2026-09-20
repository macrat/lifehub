import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

type Props = { title: string; actions?: ReactNode };

/** ページ見出し。右側に主要操作（追加ボタンなど）を置ける。 */
export function PageTitle({ title, actions }: Props) {
  return (
    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
      <Typography variant="h5" component="h2">
        {title}
      </Typography>
      {actions}
    </Stack>
  );
}
