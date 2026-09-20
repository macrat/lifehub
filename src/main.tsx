import { registerSW } from 'virtual:pwa-register';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { useIsRestoring, useQuery } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { UNAUTHORIZED_EVENT } from './lib/api.ts';
import { meQueryOptions } from './lib/auth.ts';
import { persistOptions, queryClient } from './lib/query-client.ts';
import { createAppTheme } from './lib/theme.ts';
import { ErrorPage } from './lib/ui/ErrorPage.tsx';
import { routeTree } from './routeTree.gen.ts';

/**
 * 検索パラメータは URLSearchParams でそのまま往復させる（既定の JSON 変換を使わない）。
 * OAuth の認可フローでは better-auth が署名付きのクエリ（同名キーの繰り返しを含む）を /login と /consent に
 * 付けて送ってくるため、ルーターが URL を書き換えると署名が壊れる。
 */
function parseSearch(searchStr: string): Record<string, string | string[]> {
  const params = new URLSearchParams(searchStr);
  const result: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    result[key] = values.length > 1 ? values : (values[0] ?? '');
  }
  return result;
}

function stringifySearch(search: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) for (const v of value) params.append(key, String(v));
    else params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

const router = createRouter({
  routeTree,
  context: { queryClient },
  parseSearch,
  stringifySearch,
  defaultPreload: 'intent',
  scrollRestoration: true,
  defaultErrorComponent: ErrorPage,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// API が 401 を返したら（セッション切れ等）、ログイン画面へ送る。サーバー側の検証が唯一の防御線。
window.addEventListener(UNAUTHORIZED_EVENT, () => {
  queryClient.setQueryData(meQueryOptions.queryKey, null);
  if (router.state.location.pathname !== '/login') {
    router.navigate({ to: '/login', search: { redirect: router.state.location.href } });
  }
});

// アプリシェルを precache する Service Worker。新版は次回起動時に切り替わる（autoUpdate）。
registerSW({ immediate: true });

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('#root not found');

/** 永続化キャッシュの復元が終わってからルーターを起動する（loader がキャッシュを見られるようにするため） */
function App() {
  const isRestoring = useIsRestoring();
  if (isRestoring) return null;
  return <RouterProvider router={router} />;
}

/** テーマのアクセントはログイン中のユーザーの色。取得はルートのガードに任せ、ここはキャッシュを読むだけ */
function ThemedApp() {
  const { data: me } = useQuery({ ...meQueryOptions, enabled: false });
  const theme = useMemo(() => createAppTheme(me?.hue), [me?.hue]);
  return (
    <ThemeProvider theme={theme} noSsr>
      <CssBaseline />
      <App />
    </ThemeProvider>
  );
}

createRoot(rootElement).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <ThemedApp />
    </PersistQueryClientProvider>
  </StrictMode>,
);
