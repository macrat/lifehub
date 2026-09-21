import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, type UseQueryOptions, useQueryClient } from '@tanstack/react-query';
import { del, get, set } from 'idb-keyval';

const ONE_DAY = 1000 * 60 * 60 * 24;

/**
 * サーバー状態のキャッシュ。IndexedDB に永続化し、手元のデータを常に先に描いてから裏で取り直す。
 * - gcTime は永続化の maxAge 以上にする（短いと復元直後に GC される）
 * - staleTime は 0。画面を開くたびに取り直し、届いたら差し替える。キャッシュは表示され続けるので
 *   遷移で一度空になることはない。永続化の書き込みは 1 秒遅れるため、変更直後に再読み込みすると
 *   古い内容が復元されることがあり、staleTime を置くとそれが残ってしまう
 * - 取り直しを抑えたいクエリ（`me` や VAPID 鍵など）は、それぞれで staleTime を指定する
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: ONE_DAY * 7,
      staleTime: 0,
      retry: 1,
    },
  },
});

const persister = createAsyncStoragePersister({
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
 * mutation の成功後に関連クエリを無効化する関数を返す。キーは各 feature の queryOptions / *_QUERY_KEY から渡す。
 * 再取得の完了を待つので、mutateAsync / isPending が新しいデータの到着まで伸びる（連打の抑止にもなる）
 */
export function useInvalidate(...keys: readonly (readonly unknown[])[]): () => Promise<void> {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  };
}

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
