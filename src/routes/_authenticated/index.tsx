import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { renderCard } from '../../features/dashboard/cards/index.tsx';
import { QuickAddMenu } from '../../features/dashboard/components/QuickAddMenu.tsx';
import { dashboardQueryOptions } from '../../features/dashboard/queries.ts';
import { formatDateWithYear, today } from '../../lib/date.ts';
import { ensureData } from '../../lib/query-client.ts';
import { AppBarContent } from '../../lib/ui/app-bar-slot.tsx';
import { settingsNavItem } from '../../lib/ui/navigation.ts';
import { useIsDesktop } from '../../lib/ui/use-breakpoint.ts';

export const Route = createFileRoute('/_authenticated/')({
  loader: ({ context }) => ensureData(context.queryClient, dashboardQueryOptions),
  component: HomePage,
});

/** ホーム（ダッシュボード）。カードはサーバーの registry の順に並ぶ。スマホでは末尾に設定への入口を置く。 */
function HomePage() {
  const { data: cards = [] } = useQuery(dashboardQueryOptions);
  const isDesktop = useIsDesktop();
  return (
    <>
      <AppBarContent>
        <Typography variant="subtitle1" component="h2">
          {formatDateWithYear(today())}
        </Typography>
      </AppBarContent>
      <Stack divider={<Divider />}>
        {cards.map(renderCard)}
        {!isDesktop && (
          <List disablePadding>
            <ListItem disablePadding>
              <ListItemButton component={Link} to={settingsNavItem.to}>
                <ListItemIcon>
                  <settingsNavItem.icon />
                </ListItemIcon>
                <ListItemText primary={settingsNavItem.label} />
              </ListItemButton>
            </ListItem>
          </List>
        )}
      </Stack>
      <QuickAddMenu />
    </>
  );
}
