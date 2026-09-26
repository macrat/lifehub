import { QueryClient } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';
import { afterLogin, type Me, markSignedOut, meQueryOptions } from '../auth.ts';

describe('未ログインの反映', () => {
  /**
   * 溜めた書き込みは送る時点のセッションで送られる。残っていると、次にログインした
   * 別のユーザーとして送られてしまう。
   */
  it('溜めた書き込みを捨て、me を未ログインにする', () => {
    const client = new QueryClient();
    client.getMutationCache().build(client, { mutationKey: ['write'] });
    client.setQueryData(meQueryOptions.queryKey, { id: 'u1' } as Me);

    markSignedOut(client);

    expect(client.getMutationCache().getAll()).toHaveLength(0);
    expect(client.getQueryData(meQueryOptions.queryKey)).toBeNull();
  });
});

describe('ログインの後の移動先', () => {
  /** 戻り先の検索パラメータ。区切りの文字や日本語を値に含んでも、そのまま戻る */
  const BACK = '/expenses?q=a%26b%E3%82%B9&since=2026-09-01';

  /** ログイン画面（済んでいれば戻す）と戻り先だけのルーター */
  function routerAt(path: string) {
    const root = createRootRoute();
    const expenses = createRoute({ getParentRoute: () => root, path: '/expenses' });
    const login = createRoute({
      getParentRoute: () => root,
      path: '/login',
      beforeLoad: () => {
        throw redirect(afterLogin(BACK));
      },
    });
    return createRouter({
      routeTree: root.addChildren([expenses, login]),
      history: createMemoryHistory({ initialEntries: [path] }),
    });
  }

  it('ログイン画面のガードは戻り先のパスと検索パラメータへ送る', async () => {
    const router = routerAt('/login');
    await router.load();
    expect(router.state.location.pathname).toBe('/expenses');
    expect(router.state.location.search).toEqual({ q: 'a&bス', since: '2026-09-01' });
  });

  it('ログインの成功も同じ所へ移る。戻り先が無ければホーム', async () => {
    const router = routerAt('/expenses');
    await router.load();
    await router.navigate(afterLogin(BACK));
    expect(router.state.location.search).toEqual({ q: 'a&bス', since: '2026-09-01' });
    expect(afterLogin(undefined)).toEqual({ href: '/' });
  });
});
