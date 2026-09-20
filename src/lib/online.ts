import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

/**
 * ブラウザのオンライン状態。オフライン時は閲覧のみとし、書き込み操作を無効化する（オフライン書き込みは将来の拡張）。
 * navigator.onLine は「確実にオフライン」しか示さないが、この用途には十分。
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
