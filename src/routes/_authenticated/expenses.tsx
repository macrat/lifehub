import Typography from '@mui/material/Typography';
import { createFileRoute } from '@tanstack/react-router';
import { PageTitle } from '../../lib/ui/PageTitle.tsx';

export const Route = createFileRoute('/_authenticated/expenses')({
  component: Page,
});

function Page() {
  return (
    <>
      <PageTitle title="立替" />
      <Typography color="text.secondary">準備中</Typography>
    </>
  );
}
