import { registerSW } from 'virtual:pwa-register';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { useIsRestoring } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { UNAUTHORIZED_EVENT } from './lib/api.ts';
import { meQueryOptions } from './lib/auth.ts';
import { persistOptions, queryClient } from './lib/query-client.ts';
import { theme } from './lib/theme.ts';
import { ErrorPage } from './lib/ui/ErrorPage.tsx';
import { routeTree } from './routeTree.gen.ts';

const router = createRouter({
  routeTree,
  context: { queryClient },
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

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider theme={theme} noSsr>
      <CssBaseline />
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <App />
      </PersistQueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
