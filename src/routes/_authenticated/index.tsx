import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { renderCard } from '../../features/dashboard/cards/index.tsx';
import { QuickAddMenu } from '../../features/dashboard/components/QuickAddMenu.tsx';
import { dashboardQueryOptions } from '../../features/dashboard/queries.ts';
import { formatDateWithYear, today } from '../../lib/date.ts';
import { ensureData } from '../../lib/query-client.ts';
import { AppBarContent } from '../../lib/ui/app-bar-slot.tsx';

export const Route = createFileRoute('/_authenticated/')({
  loader: ({ context }) => ensureData(context.queryClient, dashboardQueryOptions),
  component: HomePage,
});

/** ホーム（ダッシュボード）。カードはサーバーの registry の順に並ぶ。 */
function HomePage() {
  const { data: cards = [] } = useQuery(dashboardQueryOptions);
  return (
    <>
      <AppBarContent>
        <Typography variant="subtitle1" component="h2">
          {formatDateWithYear(today())}
        </Typography>
      </AppBarContent>
      <Stack divider={<Divider />}>{cards.map(renderCard)}</Stack>
      <QuickAddMenu />
    </>
  );
}
