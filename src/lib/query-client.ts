import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import {
  defaultShouldDehydrateMutation,
  type Mutation,
  onlineManager,
  partialMatchKey,
  QueryClient,
} from '@tanstack/react-query';
import { del, get, set } from 'idb-keyval';

const ONE_HOUR = 1000 * 60 * 60;
const ONE_DAY = ONE_HOUR * 24;

/**
 * オンライン判定の初期値を今の状態に合わせる。
 * TanStack Query の onlineManager は「オンラインとみなす」から始まり、以降は online / offline
 * イベントでしか変わらない。オフラインのまま起動したとき（機内で PWA を開く、圏外で再読み込みする）に
 * 届かない取得や書き込みを試してしまうので、起動時の navigator.onLine をここで 1 度だけ反映する。
 * この値は取得の一時停止・書き込みの保留・画面の案内（`lib/online.ts`）のすべてが共有する。
 */
onlineManager.setOnline(navigator.onLine);

/**
 * サーバー状態のキャッシュ。IndexedDB に永続化し、手元のデータを常に先に描いてから裏で取り直す。
 * - gcTime は永続化の maxAge 以上にする（短いと復元直後に GC される）
 * - staleTime は 0。画面を開くたびに取り直し、届いたら差し替える。キャッシュは表示され続けるので
 *   遷移で一度空になることはない。永続化の書き込みは 1 秒遅れるため、変更直後に再読み込みすると
 *   古い内容が復元されることがあり、staleTime を置くとそれが残ってしまう
 * - 取り直しを抑えたいクエリは、それぞれの queryOptions で staleTime と、そうする理由を持つ
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

/**
 * 溜める書き込み（既定）が共有する mutationKey。送り方・失敗の扱い・再取得はこのキーに紐づけてあり
 * （`lib/mutation.ts` の setMutationDefaults）、復元した書き込みにも同じものが当たる。端末に残すのもこのキーの書き込みだけ。
 */
export const WRITE_MUTATION_KEY = ['write'] as const;

export const persistOptions = {
  persister,
  maxAge: ONE_DAY * 7,
  // ビルドが変わったらキャッシュを捨てる（型の互換性を気にしなくて済む）
  buster: __BUILD_TIME__,
  dehydrateOptions: {
    /**
     * 端末に残す mutation は、送れずに保留した書き込み（`WRITE_MUTATION_KEY`）だけにする。
     * 送り方（関数）は保存できず、復元した mutation はキーに紐づけた既定（setMutationDefaults）で送られる。
     * 書き込み以外の mutation（プッシュ通知の購読、OAuth の同意）は既定を持たないので、残すと次の起動で
     * 送り方の無いまま復元されてしまう。TanStack Query の既定は保留中の mutation をすべて残すため、ここで絞る。
     */
    shouldDehydrateMutation: (mutation: Mutation) =>
      defaultShouldDehydrateMutation(mutation) &&
      partialMatchKey(mutation.options.mutationKey ?? [], WRITE_MUTATION_KEY),
  },
};
