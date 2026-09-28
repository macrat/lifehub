import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ensureOk } from '../../lib/api.ts';

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
  queryFn: async () => (await ensureOk(await api.push['vapid-public-key'].$get())).json(),
  staleTime: Number.POSITIVE_INFINITY,
});

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

/** この端末が購読済みか（ブラウザの購読があり、サーバーにも自分のものとして登録されているか） */
const pushStatusQueryOptions = queryOptions({
  queryKey: ['push', 'status'],
  queryFn: async () => {
    const subscription = await currentSubscription();
    if (!subscription) return { subscribed: false, permission: Notification.permission };
    const res = await ensureOk(
      await api.push.subscriptions.status.$get({ query: { endpoint: subscription.endpoint } }),
    );
    return { ...(await res.json()), permission: Notification.permission };
  },
});

export function usePushStatus() {
  return useQuery({ ...pushStatusQueryOptions, enabled: pushSupported });
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
      await ensureOk(
        await api.push.subscriptions.$post({
          json: {
            endpoint: json.endpoint,
            keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
          },
        }),
      );
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
      await ensureOk(
        await api.push.subscriptions.$delete({ json: { endpoint: subscription.endpoint } }),
      );
      await subscription.unsubscribe();
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: pushStatusQueryOptions.queryKey }),
  });
}
