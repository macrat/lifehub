import { MAX_BATCH_REQUESTS } from '../../shared/validation/batch.ts';

/** 束ねた応答の中の 1 本（サーバーの `server/lib/batch.ts` の `BatchPart`） */
type BatchPart = { status: number; body: string };

/** 送り出しを待っている GET */
type Waiting = {
  path: string;
  init: RequestInit | undefined;
  resolve: (res: Response) => void;
  reject: (reason: unknown) => void;
};

/** 本文を持てない応答の状態（Response に本文を渡すと例外になる） */
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

function toResponse({ status, body }: BatchPart): Response {
  return new Response(NULL_BODY_STATUSES.has(status) ? null : body, { status });
}

/**
 * 束ねた GET の URL。パスを並べ替えてから載せるので、同じ組み合わせはいつも同じ URL になり、
 * ブラウザが前の応答の ETag で確かめ直せる（変わっていなければ 304 で本文が流れない）。
 */
export function batchUrl(paths: readonly string[]): string {
  return `/api/batch?${paths.map((path) => `r=${encodeURIComponent(path)}`).join('&')}`;
}

/**
 * 同じ時点に出た GET を 1 本の要求（`GET /api/batch?r=…`。サーバーは `server/lib/batch.ts`）にまとめて送る
 * 関数を作る。send は実際に送る fetch。
 *
 * 画面は機能ごと・月ごとのクエリを並べて読むので、画面を開くと GET が何本も同時に出る（ホームは
 * ログイン中のユーザー・タイムライン・天気・レモン、カレンダーは表示に掛かる月の数）。1 本ずつ送ると、
 * 要求ごとにログインの検証と DB の往復が繰り返され、別々のインスタンスに届けばそれぞれが起動を待つ。
 * まとめれば検証は 1 回、DB の問い合わせも 1 往復にまとまる（`server/lib/db/coalesce-reads.ts`）。
 *
 * - 「同じ時点」は、いま動いている処理が終わるまで（`setTimeout(0)`）。画面の描画でクエリが一斉に動き出す分は
 *   これに収まる。
 * - 1 本だけならまとめずにそのまま送る（その要求の ETag・中断の指定がそのまま効く）。
 * - キャッシュの単位はクエリのまま変わらない（まとめるのは運び方だけ）。書き込みの後に取り直すのも、
 *   その時点に取り直すクエリだけがまとまる。
 * - 束ねた中の 1 本を中断（signal）すると、その 1 本だけが中断で終わる（束ね全体は送り終える）。
 *
 * WHY NOT 画面ごとに要るものを 1 つの応答で返す API を作る: キャッシュの単位が画面ごとの大きな塊になり、
 * 書き込みの後に一部だけを取り直すことも、別の画面と同じデータを分け合うこともできなくなる。
 */
export function createGetBatcher(
  send: (input: string, init?: RequestInit) => Promise<Response>,
): (path: string, init?: RequestInit) => Promise<Response> {
  let waiting: Waiting[] = [];

  /** 1 本の束ねた要求で運び、待っている要求それぞれに結果を返す */
  async function sendBatch(paths: string[], items: Waiting[]): Promise<void> {
    try {
      const res = await send(batchUrl(paths));
      if (!res.ok) {
        // 束ね全体の失敗（未認証など）は、中の要求それぞれの失敗として返す
        const part = { status: res.status, body: await res.text() };
        for (const item of items) item.resolve(toResponse(part));
        return;
      }
      const parts = (await res.json()) as BatchPart[];
      const byPath = new Map(paths.map((path, i) => [path, parts[i]]));
      for (const item of items) {
        const part = byPath.get(item.path);
        if (part) item.resolve(toResponse(part));
        else item.reject(new Error(`束ねた応答に ${item.path} がありません`));
      }
    } catch (error) {
      for (const item of items) item.reject(error);
    }
  }

  function flush(): void {
    const batch = waiting;
    waiting = [];
    const [first] = batch;
    if (batch.length === 1 && first) {
      send(first.path, first.init).then(first.resolve, first.reject);
      return;
    }
    // 1 本で運べる数を超えたら、何本かの束ねに分ける（サーバーの上限 `MAX_BATCH_REQUESTS`）
    const paths = [...new Set(batch.map((item) => item.path))].sort();
    for (let i = 0; i < paths.length; i += MAX_BATCH_REQUESTS) {
      const chunk = paths.slice(i, i + MAX_BATCH_REQUESTS);
      void sendBatch(
        chunk,
        batch.filter((item) => chunk.includes(item.path)),
      );
    }
  }

  return (path, init) =>
    new Promise((resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) return reject(signal.reason);
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      if (waiting.length === 0) setTimeout(flush, 0);
      waiting.push({ path, init, resolve, reject });
    });
}
