import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Outlet, redirect, useNavigate } from '@tanstack/react-router';
import { authClient, meQueryOptions } from '../lib/auth.ts';
import { ensureData } from '../lib/query-client.ts';
import { AppShell } from '../lib/ui/AppShell.tsx';

/**
 * ログイン必須のページをまとめるパスなしレイアウト。
 * ここでの判定は UX のためだけで、防御はサーバーの 401（src/lib/api.ts が受けてログイン画面へ送る）。
 */
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context, location }) => {
    // キャッシュにユーザーがあればそれを信じて即起動する（期限切れはサーバーの 401 で検出する）。
    // キャッシュが「未ログイン」でもオンラインなら取り直す（ログイン直後に永続化が追いつかない場合があるため）。
    let me = await ensureData(context.queryClient, meQueryOptions);
    if (!me && navigator.onLine) {
      me = await context.queryClient.fetchQuery({ ...meQueryOptions, staleTime: 0 });
    }
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
