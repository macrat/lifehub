import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { createFileRoute, Link } from '@tanstack/react-router';
import { AddMenu } from '../../features/calendar/components/AddMenu.tsx';
import { calendarMonthQueryOptions } from '../../features/calendar/queries.ts';
import { BalanceCard } from '../../features/dashboard/cards/BalanceCard.tsx';
import { LemonCard } from '../../features/dashboard/cards/LemonCard.tsx';
import { TodayCard } from '../../features/dashboard/cards/TodayCard.tsx';
import { balanceQueryOptions } from '../../features/expenses/queries.ts';
import { lemonStatusQueryOptions } from '../../features/lemon/queries.ts';
import { formatDateWithYear, today, toMonthString } from '../../lib/date.ts';
import { ensureData } from '../../lib/query-client.ts';
import { AppBarContent } from '../../lib/ui/app-bar-slot.tsx';
import { settingsNavItem } from '../../lib/ui/navigation.ts';
import { useIsDesktop } from '../../lib/ui/use-breakpoint.ts';

export const Route = createFileRoute('/_authenticated/')({
  // 各カードのクエリを先読みする（オフラインならキャッシュから）
  loader: ({ context }) =>
    Promise.all([
      ensureData(context.queryClient, calendarMonthQueryOptions(toMonthString(today()))),
      ensureData(context.queryClient, balanceQueryOptions),
      ensureData(context.queryClient, lemonStatusQueryOptions),
    ]),
  component: HomePage,
});

/** ホーム。各機能のカードを並べる（それぞれが自分の機能のクエリを読む）。スマホでは末尾に設定への入口を置く。 */
function HomePage() {
  const isDesktop = useIsDesktop();
  return (
    <>
      <AppBarContent>
        <Typography variant="subtitle1" component="h2">
          {formatDateWithYear(today())}
        </Typography>
      </AppBarContent>
      <Stack divider={<Divider />}>
        <TodayCard />
        <BalanceCard />
        <LemonCard />
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
      <AddMenu kinds={['lemon', 'expense', 'task', 'event']} />
    </>
  );
}
