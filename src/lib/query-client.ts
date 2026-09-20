import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { del, get, set } from 'idb-keyval';

const ONE_DAY = 1000 * 60 * 60 * 24;

/**
 * サーバー状態のキャッシュ。IndexedDB に永続化し、起動直後は前回のデータを即表示してから再取得する。
 * gcTime は永続化の maxAge 以上にする（短いと復元直後に GC される）。
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: ONE_DAY * 7,
      staleTime: 1000 * 30,
      retry: 1,
    },
  },
});

export const persister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => get<string>(key),
    setItem: (key, value) => set(key, value),
    removeItem: (key) => del(key),
  },
  key: 'lifehub-query-cache',
});

export const persistOptions = {
  persister,
  maxAge: ONE_DAY * 7,
  // アプリのバージョンが変わったらキャッシュを捨てる（型の互換性を気にしなくて済む）
  buster: __APP_VERSION__,
};

/**
 * ルートの loader / beforeLoad 用。オフラインではネットワークを待たずにキャッシュだけを返す
 * （TanStack Query はオフライン中の取得を一時停止するため、ensureQueryData が完了しなくなる）。
 * キャッシュが無ければ undefined。
 */
export async function ensureData<T, K extends readonly unknown[]>(
  client: QueryClient,
  options: UseQueryOptions<T, Error, T, K> & { queryKey: K },
): Promise<T | undefined> {
  if (!navigator.onLine) return client.getQueryData<T>(options.queryKey);
  return client.ensureQueryData(options);
}
