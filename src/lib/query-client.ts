import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import {
  QueryClient,
  type UseQueryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { del, get, set } from 'idb-keyval';
import { notify } from './ui/notice.ts';

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

type OptimisticMutationOptions<TInput> = {
  mutationFn: (input: TInput) => Promise<unknown>;
  /** この mutation が変えるクエリのキー（各 feature の queryOptions / *_QUERY_KEY から渡す） */
  keys: readonly (readonly unknown[])[];
  /** 送信と同時にキャッシュへ書き込む、サーバーが返すはずの値。取得済みのクエリだけを書き換える */
  apply?: (client: QueryClient, input: TInput) => void;
};

/**
 * 書き込みの mutation。送信を待たずに結果を先にキャッシュへ置くので、画面には即座に反映される
 * （フォームは送信と同時に閉じてよい）。失敗したら送信前の値に戻し、理由を通知で伝える。
 * 送信が終わったら keys を無効化してサーバーの値に合わせる（再取得の完了は待たない）。
 */
export function useOptimisticMutation<TInput>({
  mutationFn,
  keys,
  apply,
}: OptimisticMutationOptions<TInput>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onMutate: async (input: TInput) => {
      // 送信中に届く取得結果で投機的な表示が上書きされないよう、取得を止めてから書き換える
      await Promise.all(keys.map((queryKey) => queryClient.cancelQueries({ queryKey })));
      const snapshot = keys.flatMap((queryKey) => queryClient.getQueriesData({ queryKey }));
      apply?.(queryClient, input);
      return snapshot;
    },
    onError: (error, _input, snapshot) => {
      for (const [queryKey, data] of snapshot ?? []) queryClient.setQueryData(queryKey, data);
      notify(error.message);
    },
    onSettled: () => {
      for (const queryKey of keys) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });
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
