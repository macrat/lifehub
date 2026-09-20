import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Outlet, redirect, useNavigate } from '@tanstack/react-router';
import { authClient, meQueryOptions } from '../lib/auth.ts';
import { AppShell } from '../lib/ui/AppShell.tsx';

/**
 * ログイン必須のページをまとめるパスなしレイアウト。
 * ここでの判定は UX のためだけで、防御はサーバーの 401（src/lib/api.ts が受けてログイン画面へ送る）。
 */
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context, location }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    if (!me) {
      throw redirect({ to: '/login', search: { redirect: location.href } });
    }
    return { me };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { data: me } = useSuspenseQuery(meQueryOptions);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const logout = async () => {
    await authClient.signOut();
    queryClient.setQueryData(meQueryOptions.queryKey, null);
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    await navigate({ to: '/login' });
  };

  return (
    <AppShell userName={me?.name ?? ''} onLogout={logout}>
      <Outlet />
    </AppShell>
  );
}
