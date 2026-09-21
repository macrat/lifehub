import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

/**
 * ブラウザのオンライン状態。TanStack Query の onlineManager をそのまま読むので、
 * 表示（オフラインの案内）と実際の振る舞い（取得の一時停止・書き込みの保留）が必ず一致する。
 * navigator.onLine は「確実にオフライン」しか示さないが、この用途には十分。
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (callback) => onlineManager.subscribe(callback),
    () => onlineManager.isOnline(),
    () => true,
  );
}
