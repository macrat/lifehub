import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import {
  defaultShouldDehydrateMutation,
  type MutateOptions,
  type Mutation,
  onlineManager,
  partialMatchKey,
  QueryClient,
  useIsFetching,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { del, get, set } from 'idb-keyval';
import { newId } from '../../shared/id.ts';
import { NetworkError, sendWrite, type WriteRequest } from './api.ts';
import { meQueryOptions } from './auth.ts';
import { notify } from './ui/notice.ts';

export const ONE_HOUR = 1000 * 60 * 60;
export const ONE_DAY = ONE_HOUR * 24;

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

/**
 * 画面が読むクエリの状態（`useQuery` / `useQueries` の結果をそのまま渡せる形）。
 * `lib/ui/QueryView.tsx` が「手元のデータ・骨組み・失敗」の描き分けに使う。
 */
export type QueryState<T> = { data: T | undefined; error: Error | null };

/**
 * 手元に何も出せないまま取得を待っているか（画面上部のインジケータが見るもの）。
 * 数に入れるのはデータを持たないクエリの取得だけで、キャッシュを出しながらの取り直しは入れない。
 * WHY: 画面には既に中身が出ていて裏で差し替わるだけなので、待っていることを伝える相手がいない。
 * 画面を移るたびに取り直す作りなので、入れてしまうと移動のたびに毎回インジケータが出る。
 * WHY NOT 書き込みも数える: 結果は楽観的更新で先に画面へ出ており（`useOptimisticMutation`）、
 * 送り直しの最中も画面は変わらない。諦めたときだけ通知が伝える。オフラインで溜めた書き込みに
 * 至っては送られるまで終わらないので、数えると出したままになってしまう。
 */
export function useIsLoadingWithoutCache(): boolean {
  return useIsFetching({ predicate: (query) => query.state.data === undefined }) > 0;
}

/** 書き込みが変えるクエリのキー（各 feature の queryOptions / *_QUERY_KEY から渡す） */
type WriteKeys = readonly (readonly unknown[])[];

/** 書き込み前のキャッシュ（失敗したときに戻す値） */
type Snapshot = [readonly unknown[], unknown][];

/**
 * 書き込み 1 回分の mutation の引数。すべてプレーンな値にして、送れないまま端末に残っても
 * IndexedDB に保存し、次の起動やオンライン復帰で送り直せるようにする（関数は保存できない）。
 */
type Write<TInput> = {
  request: WriteRequest;
  keys: WriteKeys;
  /** 楽観的更新（onMutate）が使う入力。送信そのものには要らない */
  input: TInput;
  /** 書き込んだときにログインしていたユーザーの ID（`sendAsAuthor`） */
  author: string | null;
};

/** 今ログインしているユーザーの ID（未ログインなら null） */
function signedInUserId(): string | null {
  return queryClient.getQueryData(meQueryOptions.queryKey)?.id ?? null;
}

/**
 * 書き込みを、書いた人がまだログインしているときだけ送る。書き込みは送る時点のセッションで送られるので、
 * 送り直しを待っている間にログアウトして別のユーザーでログインすると、そのユーザーの記録として
 * 保存されてしまう。ログアウトは溜めた書き込みを捨てるが（`markSignedOut`）、TanStack Query には
 * 送信中（送り直しの待ちを含む）の mutation を止める手段が無いので、送る試行のたびにここで確かめる。
 * 通信断ではない失敗として投げるので、送り直さずに諦め、楽観的な表示を戻して通知で伝える。
 */
async function sendAsAuthor({ request, author }: Write<unknown>): Promise<void> {
  if (author !== signedInUserId()) {
    throw new Error('ログインしているユーザーが変わったため、送れていなかった記録を取り消しました');
  }
  return sendWrite(request);
}

/**
 * すべての書き込みが共有する mutationKey。送り方・失敗の扱い・再取得はこのキーに紐づけてあり
 * （下の setMutationDefaults）、復元した書き込みにも同じものが当たる。
 */
const WRITE_MUTATION_KEY = ['write'] as const;

/**
 * 書き込みの既定。中身は関数なのでキャッシュに保存されないが、mutationKey で引き当てられるので、
 * 再読み込みで復元した書き込みもここに書いた方法で送られる。
 *
 * - networkMode（既定の `online`）: オフラインでは送らずに保留する。保留中の書き込みは
 *   永続化の対象なので（`persistOptions` の dehydrateOptions）、アプリを閉じても消えず、
 *   オンラインに戻るか次の起動時（main.tsx の `resumeWrites`）に送られる。
 * - scope: 同じ scope の mutation は 1 つずつ順に走る。溜めた書き込みが操作した順に再生されるので、
 *   「追加してから直す」がそのままの順でサーバーに届く。
 * - retry: 通信断だけ送り直す。同じ id で送り直しても二重に作られない（サーバーは同じ id の作成が既にあれば何も書かない）。
 *   サーバーが理由を返した失敗（検証エラーなど）は送り直しても変わらないので、その場で諦める。
 */
queryClient.setMutationDefaults<unknown, Error, Write<unknown>, Snapshot>(WRITE_MUTATION_KEY, {
  mutationFn: sendAsAuthor,
  scope: { id: 'write' },
  retry: (failureCount, error) => error instanceof NetworkError && failureCount < 5,
  onError: (error, _variables, snapshot) => {
    // 復元した書き込みには送信前の値が無い（snapshot は保存されない）。再取得がサーバーの値に揃える
    for (const [queryKey, data] of snapshot ?? []) queryClient.setQueryData(queryKey, data);
    notify('error', error.message);
  },
  onSettled: (_data, _error, { keys }) => {
    for (const queryKey of keys) {
      void queryClient.invalidateQueries({ queryKey });
    }
  },
});

/**
 * 復元した書き込みを送る。オフラインなら何もせず、オンラインに戻ったときに自動で送られる。
 * 永続化キャッシュの復元が終わった直後に 1 度だけ呼ぶ（main.tsx）。
 */
export function resumeWrites(): void {
  void queryClient.resumePausedMutations();
}

type OptimisticMutationOptions<TInput> = {
  /** 入力から送る内容を組み立てる。1 回の操作につき 1 度だけ呼ばれ、この値が端末に残る */
  request: (input: TInput) => WriteRequest;
  keys: WriteKeys;
  /** 送信と同時にキャッシュへ書き込む、サーバーが返すはずの値。取得済みのクエリだけを書き換える */
  apply?: (client: QueryClient, input: TInput) => void;
  /**
   * オフラインで溜めずにその場で失敗させる。溜めても意味が無い書き込みを false にする:
   * 端末に残したくないもの（パスワードを含むユーザーの登録・変更）と、
   * 送れるまで結果を出せないもの（カレンダーの配信 URL は、発行されるまで渡す URL が無い）。
   */
  queue?: boolean;
};

/**
 * 書き込みの mutation。送信を待たずに結果を先にキャッシュへ置くので、画面には即座に反映される
 * （フォームは送信と同時に閉じてよい）。失敗したら送信前の値に戻し、理由を通知で伝える。
 * 送信が終わったら keys を無効化してサーバーの値に合わせる（再取得の完了は待たない）。
 * オフラインでは送信せずに端末へ溜め、オンラインに戻ったときに溜めた順で送る。
 */
export function useOptimisticMutation<TInput>({
  request,
  keys,
  apply,
  queue = true,
}: OptimisticMutationOptions<TInput>) {
  const queryClient = useQueryClient();
  const mutation = useMutation<unknown, Error, Write<TInput>, Snapshot>({
    mutationKey: WRITE_MUTATION_KEY,
    // 溜めないものは、オフラインでも送信を試みてその場で失敗させる（保留にすると結果が出ない）
    ...(queue ? {} : { networkMode: 'always' as const, retry: 0 }),
    onMutate: async ({ input }) => {
      // 送信中に届く取得結果で投機的な表示が上書きされないよう、取得を止めてから書き換える
      await Promise.all(keys.map((queryKey) => queryClient.cancelQueries({ queryKey })));
      const snapshot = keys.flatMap((queryKey) => queryClient.getQueriesData({ queryKey }));
      apply?.(queryClient, input);
      return snapshot;
    },
  });

  const write = (input: TInput): Write<TInput> => ({
    request: request(input),
    keys,
    input,
    author: signedInUserId(),
  });
  return {
    mutate: (
      input: TInput,
      options?: MutateOptions<unknown, Error, Write<TInput>, Snapshot>,
    ): void => mutation.mutate(write(input), options),
    /**
     * 保存が受け付けられるまで待つ（フォームはこれを待って閉じる）。
     * 溜める書き込みは、送り始めた（オフラインなら端末に溜めた）時点で受け付けたものとして扱い、
     * サーバーの返事を待たない。結果は楽観的更新で先に画面へ出ているので、待つ間フォームを
     * 開いたままにすると、保存後の画面に入力の名残（カレンダーの下書きの枠など）が重なって見える。
     * 失敗は既定の onError が画面を送信前へ戻し、通知で伝える。
     * WHY NOT 失敗したらフォームを開き直す: そのためには返事が来るまでフォームを（隠して）残す必要があり、
     * その間は入力の名残が画面に残る。検証はクライアントでも同じスキーマで済ませているので、
     * サーバーに断られるのは稀で、打ち直しの手間より保存後の見た目が常に正しいことを取る。
     * 溜めない書き込みはサーバーの結果が無ければ何も出せないので、返事を待ち、失敗はフォームに出す。
     */
    mutateAsync: async (input: TInput): Promise<void> => {
      if (queue) {
        mutation.mutate(write(input));
        return;
      }
      await mutation.mutateAsync(write(input));
    },
  };
}

/**
 * 記録を追加する mutation。行の id をここで決めて入力に足す（1 回の操作につき 1 つ）。
 * WHY: id を先に決めておくと、オフラインで作った記録もその場で編集・削除でき（仮の id を
 * 後から本物へ差し替えずに済む）、通信が切れて送り直しても二重に作られない
 * （サーバーは同じ id の作成が既にあれば何も書かない）。
 * 追加は必ずフォームからの保存なので、mutateAsync（保存が受け付けられたら閉じる）だけを返す。
 */
export function useCreateMutation<TInput>(
  options: OptimisticMutationOptions<TInput & { id: string }>,
) {
  const create = useOptimisticMutation(options);
  return {
    mutateAsync: (input: TInput): Promise<void> => create.mutateAsync({ ...input, id: newId() }),
  };
}
