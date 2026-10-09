import { QueryClient } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';
import { afterLogin, consentHostsOf, type Me, markSignedOut, meQueryOptions } from '../auth.ts';

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

describe('同意画面に出すクライアントの見分け方', () => {
  it('client_id の URL と redirect_uri のホストを出す', () => {
    expect(
      consentHostsOf(
        'https://claude.ai/oauth/mcp-oauth-client-metadata',
        'https://claude.ai/api/mcp/auth_callback',
      ),
    ).toEqual({ clientHost: 'claude.ai', redirectHost: 'claude.ai' });
  });

  /** ループバックへ戻す native クライアントは、ポートまで出して見分ける */
  it('ポートもホストに含める', () => {
    expect(
      consentHostsOf('https://example.com/client.json', 'http://127.0.0.1:3000/callback'),
    ).toEqual({ clientHost: 'example.com', redirectHost: '127.0.0.1:3000' });
  });

  /** サーバー内部から登録したクライアントの client_id は URL ではない */
  it('URL でない client_id はそのまま出し、redirect_uri が無ければ戻り先を出さない', () => {
    expect(consentHostsOf('abc123', undefined)).toEqual({
      clientHost: 'abc123',
      redirectHost: null,
    });
  });

  it('client_id が無ければ配布元を出さない', () => {
    expect(consentHostsOf(undefined, undefined)).toEqual({ clientHost: null, redirectHost: null });
  });
});
