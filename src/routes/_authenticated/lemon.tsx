import Typography from '@mui/material/Typography';
import { createFileRoute } from '@tanstack/react-router';
import { PageTitle } from '../../lib/ui/PageTitle.tsx';

export const Route = createFileRoute('/_authenticated/lemon')({
  component: Page,
});

function Page() {
  return (
    <>
      <PageTitle title="レモン" />
      <Typography color="text.secondary">準備中</Typography>
    </>
  );
}
