import {
  type DataTag,
  type MutationOptions,
  type QueryClient,
  type QueryKey,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { newId } from '../../shared/id.ts';
import { isNetworkError, sendWrite, type WriteRequest } from './api.ts';
import { signedInUserId } from './auth.ts';
import { putById } from './list.ts';
import { withMoveAnimation } from './move-animation.ts';
import { queryClient, WRITE_MUTATION_KEY } from './query-client.ts';
import { notify } from './ui/notice.ts';
import { useOpenWith } from './ui/use-toggle.ts';

/**
 * 書き込み（mutation）: 楽観的更新、オフラインで溜めて順に送る書き込みのキュー、失敗の扱い。
 * 仕組みは docs/architecture.md の「書き込み」「オフラインの書き込み」。
 */

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

/**
 * 書き込みを、書いた人がまだログインしているときだけ送る。書き込みは送る時点のセッションで送られるので、
 * 送り直しを待っている間にログアウトして別のユーザーでログインすると、そのユーザーの記録として
 * 保存されてしまう。ログアウトは溜めた書き込みを捨てるが（`markSignedOut`）、TanStack Query には
 * 送信中（送り直しの待ちを含む）の mutation を止める手段が無いので、送る試行のたびにここで確かめる。
 * 通信断ではない失敗として投げるので、送り直さずに諦め、楽観的な表示を戻して通知で伝える。
 */
async function sendAsAuthor({ request, author }: Write<unknown>): Promise<void> {
  if (author !== signedInUserId(queryClient)) {
    throw new Error('ログインしているユーザーが変わったため、送れていなかった記録を取り消しました');
  }
  return sendWrite(request);
}

/**
 * 溜めない書き込み（`queue: false`）の mutationKey。溜める書き込みと別のキーにして、
 * 溜める書き込みの順番待ち（scope）にも、端末に残す対象（`persistOptions`）にも入れない。
 * WHY: 同じキーだと、オフラインで溜めた書き込みがある間はその後ろで順番を待ち、待つ間は
 * 保留中として端末に残ってしまう（パスワードが IndexedDB に書かれる）うえ、
 * フォームもオンラインに戻るまで結果が出ない。溜めない書き込みはどれも溜める書き込みと
 * 独立しているので、順番を待つ必要も無い。
 */
const DIRECT_WRITE_MUTATION_KEY = ['direct-write'] as const;

/** 書き込みの結果の扱い（溜める・溜めないで共通）。失敗は送信前の値に戻して通知し、終わったらサーバーの値に揃える */
const settleWrite = {
  mutationFn: sendAsAuthor,
  onError: async (error, _variables, snapshot) => {
    // 復元した書き込みには送信前の値が無い（snapshot は保存されない）。再取得がサーバーの値に揃える。
    // 戻し終えてから取り直す（onSettled）。先に取り直しが届くと、それを送信前の値で上書きしてしまう
    if (snapshot) {
      await withMoveAnimation(() => {
        for (const [queryKey, data] of snapshot) queryClient.setQueryData(queryKey, data);
      });
    }
    notify('error', error.message);
  },
  onSettled: (_data, _error, { keys }) => {
    for (const queryKey of keys) {
      void queryClient.invalidateQueries({ queryKey });
    }
  },
} satisfies MutationOptions<unknown, Error, Write<unknown>, Snapshot>;

/**
 * 溜める書き込みの既定。中身は関数なのでキャッシュに保存されないが、mutationKey で引き当てられるので、
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
  ...settleWrite,
  scope: { id: 'write' },
  retry: (failureCount, error) => isNetworkError(error) && failureCount < 5,
});

/** 溜めない書き込みの既定。オフラインでも送信を試みてその場で失敗させる（保留にすると結果が出ない） */
queryClient.setMutationDefaults<unknown, Error, Write<unknown>, Snapshot>(
  DIRECT_WRITE_MUTATION_KEY,
  { ...settleWrite, networkMode: 'always', retry: 0 },
);

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
  apply?: (client: QueryClient, input: NoInfer<TInput>) => void;
  /**
   * オフラインで溜めずにその場で失敗させる。端末に残したくないものと、送れるまで結果を出せないものを
   * false にする（どれがそうかは docs/architecture.md の「溜めないもの」）。
   */
  queue?: boolean;
};

/** 書き込みの mutation（`useOptimisticMutation`）。TArgs は呼び出しの引数 */
type OptimisticMutation<TArgs> = {
  mutate: (args: TArgs) => void;
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
  mutateAsync: (args: TArgs) => Promise<void>;
};

/**
 * 書き込みの mutation。送信を待たずに結果を先にキャッシュへ置くので、画面には即座に反映される
 * （フォームは送信と同時に閉じてよい）。失敗したら送信前の値に戻し、理由を通知で伝える。
 * 先に出すときも戻すときも、動いた項目は元の位置から滑らせる（`withMoveAnimation`）。
 * 送信が終わったら keys を無効化してサーバーの値に合わせる（再取得の完了は待たない）。
 * オフラインでは送信せずに端末へ溜め、オンラインに戻ったときに溜めた順で送る。
 */
export function useOptimisticMutation<TInput, TArgs>(
  options: OptimisticMutationOptions<TInput> & {
    /**
     * 呼び出しの引数 → 入力。押した時にだけ決まる値（新しい行の id、完了日時）をここで 1 度だけ決めて足す。
     * 決めた値は入力として端末に残るので、溜めた書き込みを後で送っても、送り直しても変わらない。
     */
    prepare: (args: TArgs) => TInput;
  },
): OptimisticMutation<TArgs>;
export function useOptimisticMutation<TInput>(
  options: OptimisticMutationOptions<TInput>,
): OptimisticMutation<TInput>;
export function useOptimisticMutation<TInput>({
  request,
  keys,
  apply,
  queue = true,
  prepare = (args) => args as TInput,
}: OptimisticMutationOptions<TInput> & {
  prepare?: (args: unknown) => TInput;
}): OptimisticMutation<unknown> {
  const queryClient = useQueryClient();
  const mutation = useMutation<unknown, Error, Write<TInput>, Snapshot>({
    mutationKey: queue ? WRITE_MUTATION_KEY : DIRECT_WRITE_MUTATION_KEY,
    onMutate: async ({ input }) => {
      // 送信中に届く取得結果で投機的な表示が上書きされないよう、取得を止めてから書き換える
      await Promise.all(keys.map((queryKey) => queryClient.cancelQueries({ queryKey })));
      const snapshot = keys.flatMap((queryKey) => queryClient.getQueriesData({ queryKey }));
      // 書き換え終えてから送る。先に送ると、返事を受けた取り直しの結果に同じ書き換えを重ねてしまう（追加が 2 件になる）
      if (apply) await withMoveAnimation(() => apply(queryClient, input));
      return snapshot;
    },
  });

  const write = (args: unknown): Write<TInput> => {
    const input = prepare(args);
    return { request: request(input), keys, input, author: signedInUserId(queryClient) };
  };
  return {
    mutate: (args) => mutation.mutate(write(args)),
    mutateAsync: async (args) => {
      if (queue) {
        mutation.mutate(write(args));
        return;
      }
      await mutation.mutateAsync(write(args));
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
): Pick<OptimisticMutation<TInput>, 'mutateAsync'> {
  const create = useOptimisticMutation({
    ...options,
    prepare: (input: TInput) => ({ ...input, id: newId() }),
  });
  return { mutateAsync: create.mutateAsync };
}

/**
 * 秘密を発行する書き込み（API キー、配信 URL）。サーバーはハッシュしか持たず、秘密を見られるのは発行の応答だけ。
 *
 * - 応答の本文を画面に出すので、値を返さない共通の書き込み（`useOptimisticMutation`）ではなく応答を待つ。
 * - オフラインでは溜めずにその場で失敗する（秘密はサーバーが作るので、送れるまで出せるものが無い）。
 * - 応答の一覧の 1 行（`item`）を一覧の末尾（作成日時の昇順）へ足し、一覧は取り直さない。秘密（`secret`）は
 *   一覧に入れない（キャッシュは端末の IndexedDB に残るので、秘密を置かない）。応答が 2 つを分けて返すので、
 *   秘密を一覧へ入れる書き方は型が通らない（`server/lib/secret.ts` の `Issued`）。
 * - 発行した応答は閉じるまで `issued` だけが持つ（サーバーにもキャッシュにも残らない）。
 */
export function useIssueMutation<TInput, TItem extends { id: string }>({
  request,
  queryKey,
}: {
  request: (input: TInput) => Promise<{ item: TItem; secret: string }>;
  queryKey: DataTag<QueryKey, TItem[], Error>;
}) {
  const client = useQueryClient();
  const issued = useOpenWith<{ item: TItem; secret: string }>();
  const mutation = useMutation({
    mutationFn: request,
    networkMode: 'always',
    onSuccess: ({ item }) => {
      client.setQueryData(queryKey, (items) => items && putById(items, item.id, item));
    },
  });
  return {
    issue: async (input: TInput) => issued.open(await mutation.mutateAsync(input)),
    /** 発行した直後の応答（秘密を含む）。閉じるまで出したままにする */
    issued: issued.value,
    closeIssued: issued.close,
  };
}
