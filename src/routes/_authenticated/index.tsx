import Stack from '@mui/material/Stack';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { renderCard } from '../../features/dashboard/cards/index.tsx';
import { QuickAddMenu } from '../../features/dashboard/components/QuickAddMenu.tsx';
import { dashboardQueryOptions } from '../../features/dashboard/queries.ts';
import { PageTitle } from '../../lib/ui/PageTitle.tsx';

export const Route = createFileRoute('/_authenticated/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(dashboardQueryOptions),
  component: HomePage,
});

/** ホーム（ダッシュボード）。カードはサーバーの registry の順に並ぶ。 */
function HomePage() {
  const { data: cards = [] } = useQuery(dashboardQueryOptions);
  return (
    <>
      <PageTitle title="ホーム" />
      <Stack spacing={2}>{cards.map(renderCard)}</Stack>
      <QuickAddMenu />
    </>
  );
}
