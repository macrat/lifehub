type Waiting<V> = {
  key: string;
  signal: AbortSignal;
  resolve: (value: V) => void;
  reject: (reason: unknown) => void;
};

/**
 * 同じ時点に頼まれた鍵を、まとめて 1 回で読む関数を作る。load は鍵の一覧（重複なし）を受けて、鍵ごとの値を返す。
 * キャッシュの単位（鍵ごとのクエリ）はそのままに、取得だけをまとめるのに使う（カレンダーの月。`events/queries.ts`）。
 * 各クエリの queryFn から呼べば、TanStack Query の取得の状態・取り直し・invalidate はクエリごとに今までどおり動く。
 *
 * - 「同じ時点」は、いま動いている処理が終わるまで。最初の鍵が来たときにマイクロタスクで送り出しを予約し、
 *   それまでに来た鍵を 1 回で読む。TanStack Query は同じ描画で始まったクエリ（`useQueries` の購読）や
 *   invalidate で取り直すクエリの queryFn を続けて同期的に呼ぶので、それらは 1 回にまとまる。
 *   マイクロタスクで送るので、同じ時点に出たほかの手続きとも 1 本の要求に載る（`httpBatchLink` は
 *   `setTimeout` で送り出すので、それより先に積める）。
 * - 中断は、まとめた鍵の頼み手がすべて中断したときだけ load に伝える。1 つが中断しても、ほかの鍵の値は要る。
 *   中断した頼み手のクエリは TanStack Query が自分で取り消すので、ここで個別に断る必要は無い。
 *
 * WHY NOT 手元に無い月をまとめて取って `setQueryData` で書く: 取得中・失敗の状態、invalidate での取り直し、
 * 取得の重複の排除を、TanStack Query の代わりに自分で持つことになる。
 * WHY NOT DataLoader: 中断（AbortSignal）を扱えず、頼み手がすべて去っても要求を止められない。
 */
export function batchLoads<V>(
  load: (keys: string[], signal: AbortSignal) => Promise<Record<string, V>>,
): (key: string, signal: AbortSignal) => Promise<V> {
  let pending: Waiting<V>[] = [];

  const flush = async () => {
    const batch = pending;
    pending = [];
    const controller = new AbortController();
    const abortIfAllGone = () => {
      if (batch.every((item) => item.signal.aborted)) controller.abort();
    };
    for (const item of batch) item.signal.addEventListener('abort', abortIfAllGone);
    // 送り出す前に中断されていた頼み手は、イベントがもう来ない
    abortIfAllGone();
    try {
      const values = await load([...new Set(batch.map((item) => item.key))], controller.signal);
      for (const item of batch) {
        const value = values[item.key];
        if (value === undefined) item.reject(new Error(`no value for ${item.key}`));
        else item.resolve(value);
      }
    } catch (error) {
      for (const item of batch) item.reject(error);
    } finally {
      for (const item of batch) item.signal.removeEventListener('abort', abortIfAllGone);
    }
  };

  return (key, signal) =>
    new Promise((resolve, reject) => {
      if (pending.length === 0) queueMicrotask(flush);
      pending.push({ key, signal, resolve, reject });
    });
}
