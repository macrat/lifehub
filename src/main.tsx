import { registerSW } from 'virtual:pwa-register';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { useIsRestoring } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { UNAUTHORIZED_EVENT } from './lib/api.ts';
import { watchAppBadge } from './lib/app-badge.ts';
import { markSignedOut } from './lib/auth.ts';
import { persistOptions, queryClient, resumeWrites } from './lib/query-client.ts';
import { initSentry, reportCaughtError } from './lib/sentry.ts';
import { useAppTheme } from './lib/theme.ts';
import { ErrorPage } from './lib/ui/ErrorPage.tsx';
import { ListSkeleton } from './lib/ui/QueryView.tsx';
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

/** カレンダーの表示（月・週・日・リスト）。画面が変わったかの判定に使う */
const viewOf = ({ searchStr }: { searchStr: string }) => new URLSearchParams(searchStr).get('view');

const router = createRouter({
  routeTree,
  context: { queryClient },
  parseSearch,
  stringifySearch,
  defaultPreload: 'intent',
  /**
   * 移動の後に、ルーターが画面のスクロール位置を戻す（新しい移動は一番上、戻る・進むは前にいた位置）。
   * 最初の位置を画面自身が決めるルート（`staticData.ownsScroll`）では触らない。触ると、画面が描画時に
   * 置いた位置を、その後の描画完了の知らせ（onRendered）で上書きしてしまう。戻る・進むでも前にいた位置へは
   * 戻さず、最初の位置で出す。
   * WHY NOT 移動ごとの resetScroll: false: 最初の位置を決めるのは画面なので、ルートに持たせる。リンクごとに
   * 付けると、ナビ以外の入口（戻る・進む、今後増えるリンク）ごとに付け忘れられない決まりになる
   */
  scrollRestoration: () => !ownsScroll(),
  defaultErrorComponent: ErrorPage,
  /**
   * 移動は何も待たせない。ページのコードを読み込む間（初回だけ。以降は Service Worker の precache）も
   * 前の画面に留めず、すぐ切り替えて骨組みを出す（`defaultPendingMs: 0`）。
   * データの到着は待たない（ルートに loader を置かず、各画面が自分のクエリを読んで骨組みを出す）ので、
   * ここで待つのはコードの読み込みだけ。
   */
  defaultPendingMs: 0,
  defaultPendingComponent: ListSkeleton,
  /**
   * 画面が変わる移動は View Transition で繋ぐ。前後の画面に共通して在るもの（カレンダーの表示を
   * 切り替えたときの同じ予定、レモンの状況のタイル、ホームの天気のタイルと週間天気のその日の行）は名前を合わせてあり、その場から動く。
   * 名前の無いものはフェードする。
   * 画面が変わるのはパスが変わるときと、カレンダーの表示が変わるとき。
   *
   * 同じ画面の中での更新（スワイプでの前後移動、リストの絞り込み、検索キーワードの入力）では使わない。
   * 指やキーの動きに合わせて出る所なので、そのたびに画面全体がフェードすると却って遅く見える。
   * 戻る・進むを含めどの経路でも同じ判定になるよう、個々の navigate ではなくここで一度だけ決める。
   * 返す値は「遷移する（種別は付けない）」が `[]`、「遷移しない」が `false`。
   */
  defaultViewTransition: {
    types: ({ fromLocation, toLocation }) =>
      fromLocation !== undefined &&
      (fromLocation.pathname !== toLocation.pathname || viewOf(fromLocation) !== viewOf(toLocation))
        ? []
        : false,
  },
});

/** 描画し終えた画面のルートの照合結果から読む（ルーターが既に照合したものを使い、照合し直さない） */
function ownsScroll(): boolean {
  return router.state.matches.some((match) => match.staticData.ownsScroll);
}

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
  interface StaticDataRouteOption {
    /**
     * 最初の位置を画面自身が決める（ホームは一番上、立替・レモンは今日の記録、天気は今日）。true ならルーターは
     * スクロール位置に触らない（戻る・進むでも前にいた位置へ戻さず、最初の位置で出す）
     */
    ownsScroll?: boolean;
  }
}

// API が 401 を返したら（セッション切れ等）、ログイン画面へ送る。サーバー側の検証が唯一の防御線。
window.addEventListener(UNAUTHORIZED_EVENT, () => {
  markSignedOut(queryClient);
  if (router.state.location.pathname !== '/login') {
    router.navigate({ to: '/login', search: { redirect: router.state.location.href } });
  }
});

// Sentry への報告はルーターができたらすぐ始める（この後の起動処理で起きたエラーも拾い、最初の画面の読み込みも計る）
initSentry(router, queryClient);

// アプリシェルを precache する Service Worker。新版は次回起動時に切り替わる（autoUpdate）。
registerSW({ immediate: true });

// 通知が付けたホーム画面のアイコンの点を、アプリを見た時点で消す
watchAppBadge();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('#root not found');

/** 永続化キャッシュの復元が終わってからルーターを起動する（ログイン判定の beforeLoad（`resolveMe`）がキャッシュを見られるようにするため） */
function App() {
  const isRestoring = useIsRestoring();
  if (isRestoring) return null;
  return <RouterProvider router={router} />;
}

function ThemedApp() {
  const theme = useAppTheme();
  return (
    <ThemeProvider theme={theme} noSsr>
      <CssBaseline />
      <App />
    </ThemeProvider>
  );
}

createRoot(rootElement, { onCaughtError: reportCaughtError }).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
      onSuccess={resumeWrites}
    >
      <ThemedApp />
    </PersistQueryClientProvider>
  </StrictMode>,
);
