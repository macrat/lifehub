import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.ts';
import { useStoreQuery } from '../../lib/screen-data.ts';

/**
 * この端末でのプッシュ通知の購読。
 * Notifications API の許可 → PushManager 購読 → サーバーに保存、の順。iOS はホーム画面に追加した PWA でのみ動く。
 */

export const pushSupported =
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

/**
 * iOS Safari はホーム画面に追加（standalone）していないとプッシュを購読できない。
 * 判定は display-mode のメディアクエリだけで行う。`navigator.standalone` は iOS Safari では
 * ブラウザで開いていても false という値で存在するため、`'standalone' in navigator` だと常に真になる。
 */
export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches;
}

const vapidKeyQueryOptions = queryOptions({
  queryKey: ['push', 'vapid'],
  queryFn: ({ signal }) => api.push.vapidPublicKey.query(undefined, { signal }),
  staleTime: Number.POSITIVE_INFINITY,
});

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

/**
 * この端末が購読済みか（ブラウザの購読があり、サーバーにも自分のものとして登録されているか）。
 * プッシュに対応していないブラウザでは読まない（画面は `pushSupported` のときだけ購読する）
 */
export const pushStatusQueryOptions = queryOptions({
  queryKey: ['push', 'status'],
  queryFn: async ({ signal }) => {
    const subscription = await currentSubscription();
    if (!subscription) return { subscribed: false, permission: Notification.permission };
    const { subscribed } = await api.push.status.query(
      { endpoint: subscription.endpoint },
      { signal },
    );
    return { subscribed, permission: Notification.permission };
  },
});

export function usePushStatus() {
  return useStoreQuery(pushStatusQueryOptions);
}

/**
 * 購読の登録・解除は、ブラウザ（Push サービス）とサーバーの両方に繋がる操作なので溜めない。
 * WHY networkMode: 'always': オフラインで保留させず、その場で失敗させる。保留すると切り替え中のまま
 * スイッチが押せなくなり、オンラインに戻るまで何も起きない。
 */
export function useSubscribePush() {
  const queryClient = useQueryClient();
  return useMutation({
    networkMode: 'always',
    mutationFn: async () => {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('通知が許可されませんでした');
      const { publicKey } = await queryClient.ensureQueryData(vapidKeyQueryOptions);
      if (!publicKey) throw new Error('サーバーに通知の鍵が設定されていません');
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: publicKey,
        }));
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth)
        throw new Error('購読情報を取得できませんでした');
      await api.push.subscribe.mutate({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: pushStatusQueryOptions.queryKey }),
  });
}

/** 購読の解除。登録と同じく溜めずにその場で失敗させる（`useSubscribePush`） */
export function useUnsubscribePush() {
  const queryClient = useQueryClient();
  return useMutation({
    networkMode: 'always',
    mutationFn: async () => {
      const subscription = await currentSubscription();
      if (!subscription) return;
      await api.push.unsubscribe.mutate({ endpoint: subscription.endpoint });
      await subscription.unsubscribe();
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: pushStatusQueryOptions.queryKey }),
  });
}
