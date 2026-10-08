/**
 * 通知をタップしたとき、Service Worker（`src/sw.ts` の notificationclick）が開いているアプリに送る知らせ。
 * url はアプリの中のパス（検索パラメータ付き）。
 */
export type NavigateMessage = { type: 'navigate'; url: string };

/**
 * Service Worker からの知らせを受けて、開いているアプリの中で画面を移る（起動時に 1 度だけ呼ぶ。`src/main.tsx`）。
 * Service Worker にタブごと移させない理由は docs/architecture.md の「PWA」。
 */
export function listenNavigateMessages(navigate: (href: string) => void): void {
  navigator.serviceWorker?.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as Partial<NavigateMessage> | null;
    if (data?.type === 'navigate' && typeof data.url === 'string') navigate(data.url);
  });
}
