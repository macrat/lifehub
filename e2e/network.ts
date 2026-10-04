import type { Page, Request, Response, Route } from '@playwright/test';
import { expect } from './test.ts';

/**
 * 画面の API は tRPC で、同じ時点に出た呼び出しが 1 本の要求にまとめて送られる
 * （`/api/trpc/timeline.get,weather.page?batch=1&input=…`。`src/lib/api.ts`）。応答は呼び出しの順の配列
 * （`[{ result: { data } }, …]`）。ここの関数は手続きの名前（`timeline.get`）で要求を見分け、
 * まとめられた中の呼び出しも 1 本ずつ送られたものと同じに扱う。
 */

/** まとめた応答の中の 1 つの呼び出しの結果 */
type Part = { result?: { data: unknown }; error?: unknown };

/** 要求が運ぶ手続きの名前（画面の API でなければ空） */
function proceduresOf(url: string): string[] {
  const { pathname } = new URL(url);
  const prefix = '/api/trpc/';
  return pathname.startsWith(prefix) ? pathname.slice(prefix.length).split(',') : [];
}

/** 読み出し（GET）の i 番目の呼び出しの入力 */
function inputOf(url: string, i: number): unknown {
  const input = new URL(url).searchParams.get('input');
  return input === null ? undefined : (JSON.parse(input) as Record<string, unknown>)[i];
}

/** 要求が、名前が prefixes のどれかで始まる手続きを（まとめた中も含めて）運ぶか */
function carriesAny(url: URL | string, prefixes: readonly string[]): boolean {
  return proceduresOf(String(url)).some((name) => prefixes.some((p) => name.startsWith(p)));
}

/**
 * 名前が prefixes のどれか（`lemon.` や `events.create`）で始まる手続きの呼び出しを止める（保存も再取得も
 * 返ってこない状況を作る）。まとめた要求は、中に当たるものがあれば全体を止める。
 * 返り値を呼ぶと、止めていた呼び出しを送り、それからは止めない。呼ばなければページを閉じるまで止めたまま。
 * WHY 時間ではなく呼ぶまで止める: 決まった時間だけ遅らせると、その時間はテストが必ず待つことになり、
 * 遅い環境では確かめ終わる前に届いてしまう。
 */
export async function stall(page: Page, prefixes: readonly string[]): Promise<() => Promise<void>> {
  const match = (url: URL) => carriesAny(url, prefixes);
  const { promise: released, resolve: release } = Promise.withResolvers<void>();
  const handler = async (route: Route) => {
    await released;
    await route.continue().catch(() => {});
  };
  await page.route(match, handler);
  return async () => {
    release();
    await page.unroute(match, handler);
  };
}

/** 名前が prefixes のどれかで始まる手続きの呼び出しを、通信が切れたことにして失敗させる（まとめた要求は全体） */
export async function failFetches(page: Page, prefixes: readonly string[]): Promise<void> {
  await page.route(
    (url) => carriesAny(url, prefixes),
    (route) => route.abort('internetdisconnected'),
  );
}

/**
 * 手続き procedure（読み出し）の結果を、本物の結果から作り直したものに差し替える。
 * 本物を取ってから、まとめた中の当たる呼び出しの結果だけを差し替える。rewrite は呼び出しの入力を受け取る
 */
export async function rewriteJson(
  page: Page,
  procedure: string,
  rewrite: (input: unknown, real: () => Promise<unknown>) => unknown,
): Promise<void> {
  await page.route(
    (url) => proceduresOf(String(url)).includes(procedure),
    async (route) => {
      const url = route.request().url();
      const res = await route.fetch();
      const parts = (await res.json()) as Part[];
      const rewritten = await Promise.all(
        proceduresOf(url).map(async (name, i): Promise<Part | undefined> => {
          const part = parts[i];
          if (!part || name !== procedure) return part;
          const data = await rewrite(inputOf(url, i), async () => part.result?.data);
          return { result: { data } };
        }),
      );
      return route.fulfill({ response: res, json: rewritten });
    },
  );
}

/** 要求・応答が手続き procedure を（まとめた中も含めて）運ぶものか。`page.waitForResponse` などに渡す */
export function carries(procedure: string): (res: { request(): Request }) => boolean {
  return (res) => proceduresOf(res.request().url()).includes(procedure);
}

/** 手続き procedure を運んだ応答（`carries` で待ったもの）から、その呼び出しの結果を読む */
export async function carriedJson<T>(res: Response, procedure: string): Promise<T> {
  const parts = (await res.json()) as Part[];
  const part = parts[proceduresOf(res.request().url()).indexOf(procedure)];
  if (!part?.result) throw new Error(`${procedure} の結果が応答に入っていない`);
  return part.result.data as T;
}

/** 始めてからの手続き procedure の呼び出しの回数（まとめた中も 1 本と数える）を返す。取り直しが増えていないことを押さえるのに使う */
export function countFetches(page: Page, procedure: string): () => number {
  let count = 0;
  page.on('request', (request) => {
    count += proceduresOf(request.url()).filter((name) => name === procedure).length;
  });
  return () => count;
}

/** 取得が落ち着く（1 秒の間 1 件も増えない）まで待つ */
export async function quiet(page: Page, fetches: () => number) {
  for (let before = -1; before !== fetches(); ) {
    before = fetches();
    await page.waitForTimeout(1000);
  }
}

/**
 * 画面の最初の取得が届いて骨組みが消えてから、手続き procedure の呼び出しを数え始め、それからの回数を返す。
 * 開いた直後の取得を、操作したことによる取得と取り違えないようにする
 */
export async function fetchesAfterLoad(page: Page, procedure: string): Promise<() => number> {
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  return countFetches(page, procedure);
}
