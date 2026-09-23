import { createFileRoute, Outlet } from '@tanstack/react-router';
import { requireSignedIn } from '../lib/auth.ts';
import { AppShell } from '../lib/ui/AppShell.tsx';
import { primaryNavItems } from '../navigation.ts';

/**
 * ログイン必須のページをまとめるパスなしレイアウト。
 * ここでの判定は UX のためだけで、防御はサーバーの 401（src/lib/api.ts が受けてログイン画面へ送る）。
 */
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context, location }) => requireSignedIn(context.queryClient, location.href),
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <AppShell navItems={primaryNavItems}>
      <Outlet />
    </AppShell>
  );
}
