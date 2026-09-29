import type { NeonQueryFunction, NeonQueryPromise } from '@neondatabase/serverless';

/** 読み取りの文: SELECT か WITH で始まる */
const READ = /^\s*(select|with)\b/i;
/**
 * 読み取りに見えても書き込みを含むか、読み取り専用のトランザクションで通らない文。
 * データを書き換える WITH（`with x as (update ...)`）と、行の鎖（`for update` / `for share`）
 */
const WRITE = /\b(insert|update|delete|merge|share)\b/i;

/** まとめて送ってよい文か（書き込みを含まない読み取り） */
export function isReadOnlyStatement(text: string): boolean {
  return READ.test(text) && !WRITE.test(text);
}

type Sql = NeonQueryFunction<false, false>;
/** 問い合わせの値。まとめる側は結果の形に関わらないので、形を問わない型で持つ */
type Query = NeonQueryPromise<false, false>;
type Pending = {
  query: Query;
  /** この文を 1 つだけで送る（まとめずに送るときと、まとめて失敗したときの送り直し） */
  alone: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

/**
 * Neon の HTTP ドライバの問い合わせ関数を包み、同じ時点に投げられた読み取りを 1 回の HTTP 要求にまとめる。
 * HTTP ドライバは問い合わせ 1 回が HTTP の往復 1 回なので、`Promise.all` で並べた問い合わせも、同時に
 * 動く要求（束ねた API の要求 `/api/batch` の中の各要求など）の問い合わせも、まとめて 1 往復にする。
 * 呼び出し側（repository）は 1 文ずつ書いたまま、往復の回数だけが減る。
 *
 * - 「同じ時点」は、いま動いている処理とその続き（マイクロタスク）がすべて終わるまで。最初の文が
 *   来たときに `setImmediate` で送り出しを予約し、それまでに来た文を 1 つの要求に載せる。
 * - まとめるのは読み取りだけ（`isReadOnlyStatement`）。まとめた文は 1 つの読み取り専用のトランザクション
 *   として走る（Neon の `transaction`。文ごとの `arrayMode` などの形は保たれる）。書き込みの文は
 *   今までどおり 1 文ずつ送る（別の書き込みと 1 つのトランザクションにすると、片方の失敗がもう片方を
 *   巻き戻してしまう。複数文の書き込みは `runBatch` で明示的にまとめる）。
 * - まとめた中の 1 文が失敗すると全体が失敗するので、そのときは 1 文ずつ送り直し、それぞれに自分の結果か
 *   失敗を返す。読み取りなので送り直しても害は無い。
 *
 * 文の実行は、問い合わせの値（`NeonQueryPromise`）の `execute` が受け持つ（`then` / `catch` / `finally` が
 * 呼ぶ）。これを値ごとに差し替えて、送る代わりに待ち行列に積む。Drizzle の `batch`（`runBatch`）は
 * 値を `transaction` に渡すだけで `execute` を呼ばないので、明示的なトランザクションは今までどおり動く。
 *
 * WHY NOT 画面の API や repository ごとに問い合わせを 1 本の SQL に書き直す: 読み取りをまとめられる所は
 * どのエンドポイントにもあり、1 つずつ書き直すと、同じ理由の書き直しがエンドポイントの数だけ要る。
 * 1 本にまとめた SQL は、別々に読める表を 1 文の中で結び付けるので、読むのも直すのも難しくなる。
 */
export function coalesceReads(sql: Sql): Sql {
  let pending: Pending[] = [];

  const settle = (item: Pending, result: Promise<unknown>) =>
    result.then(item.resolve, item.reject);

  const flush = async () => {
    const batch = pending;
    pending = [];
    const [first] = batch;
    if (batch.length === 1 && first) return settle(first, first.alone());
    try {
      const results = await sql.transaction(
        batch.map((item) => item.query),
        { readOnly: true },
      );
      for (const [i, item] of batch.entries()) item.resolve(results[i]);
    } catch {
      for (const item of batch) void settle(item, item.alone());
    }
  };

  const query = ((text: string, params?: unknown[], opts?: Parameters<Sql['query']>[2]) => {
    const q = sql.query(text, params, opts) as unknown as Query;
    if (!isReadOnlyStatement(text)) return q;
    const execute = q.execute;
    q.execute = () =>
      new Promise((resolve, reject) => {
        if (pending.length === 0) setImmediate(flush);
        pending.push({ query: q, alone: () => execute(q.queryData, q.opts), resolve, reject });
      });
    return q;
  }) as Sql['query'];

  return Object.assign(
    ((strings: TemplateStringsArray, ...values: unknown[]) => sql(strings, ...values)) as Sql,
    { query, transaction: sql.transaction, unsafe: sql.unsafe },
  );
}
