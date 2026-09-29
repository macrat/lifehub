import type { Page, Request, Response, Route } from '@playwright/test';

/**
 * 画面の GET は、同じ時点に出たものが `GET /api/batch?r=…` の 1 本にまとめて送られる
 * （`src/lib/batch-get.ts`）。ここの関数は、まとめられた中の要求も 1 本ずつ送られたものと同じに扱う。
 */

/** 束ねた要求の中の 1 本の結果（`server/lib/batch.ts` の `BatchPart`） */
type BatchPart = { status: number; body: string };

/** 要求が運ぶ API の URL。束ねた要求なら中の要求それぞれ、それ以外はその要求そのもの */
function carriedUrls(url: string): URL[] {
  const parsed = new URL(url);
  if (parsed.pathname !== '/api/batch') return [parsed];
  return parsed.searchParams.getAll('r').map((path) => new URL(path, parsed.origin));
}

/** パスが prefixes のどれかで始まるか */
function matches(url: URL, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => url.pathname.startsWith(prefix));
}

/** 要求が prefixes のどれかで始まるパスを（束ねた中も含めて）運ぶか */
function carries(url: URL | string, prefixes: readonly string[]): boolean {
  return carriedUrls(String(url)).some((carried) => matches(carried, prefixes));
}

/**
 * prefixes のどれかで始まるパスへの通信を遅らせる（保存も再取得も返ってこない状況を作る）。
 * 束ねた要求は、中に当たるものがあれば全体を遅らせる。返り値を呼ぶと遅らせるのをやめる
 */
export async function stall(
  page: Page,
  prefixes: readonly string[],
  ms = 10_000,
): Promise<() => Promise<void>> {
  const match = (url: URL) => carries(url, prefixes);
  const handler = async (route: Route) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await route.continue().catch(() => {});
  };
  await page.route(match, handler);
  return () => page.unroute(match, handler);
}

/** prefixes のどれかで始まるパスへの取得を、通信が切れたことにして失敗させる（束ねた要求は全体） */
export async function failFetches(page: Page, prefixes: readonly string[]): Promise<void> {
  await page.route(
    (url) => carries(url, prefixes),
    (route) => route.abort('internetdisconnected'),
  );
}

/**
 * pathname への GET の応答を、本物の応答（JSON）から作り直したものに差し替える。
 * 束ねた要求は本物を取ってから、当たる中の要求の結果だけを差し替える
 */
export async function rewriteJson(
  page: Page,
  pathname: string,
  rewrite: (url: URL, real: () => Promise<unknown>) => unknown,
): Promise<void> {
  const match = (url: URL) => carriedUrls(String(url)).some((c) => c.pathname === pathname);
  await page.route(match, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== '/api/batch') {
      const json = await rewrite(url, async () => (await route.fetch()).json());
      return route.fulfill({ json });
    }
    const res = await route.fetch();
    const parts = (await res.json()) as BatchPart[];
    const rewritten = await Promise.all(
      carriedUrls(url.href).map(async (carried, i): Promise<BatchPart | undefined> => {
        const part = parts[i];
        if (!part || carried.pathname !== pathname) return part;
        const body = await rewrite(carried, async () => JSON.parse(part.body));
        return { status: 200, body: JSON.stringify(body) };
      }),
    );
    return route.fulfill({ response: res, json: rewritten });
  });
}

/** 応答が pathname への GET を（束ねた中も含めて）運ぶものか。`page.waitForResponse` に渡す */
export function carriesGet(pathname: string): (res: { request(): Request }) => boolean {
  return (res) =>
    res.request().method() === 'GET' &&
    carriedUrls(res.request().url()).some((carried) => carried.pathname === pathname);
}

/** pathname への GET を運んだ応答（`carriesGet` で待ったもの）から、その GET の結果の JSON を読む */
export async function carriedJson<T>(res: Response, pathname: string): Promise<T> {
  const urls = carriedUrls(res.request().url());
  if (new URL(res.url()).pathname !== '/api/batch') return (await res.json()) as T;
  const parts = (await res.json()) as BatchPart[];
  const part = parts[urls.findIndex((url) => url.pathname === pathname)];
  if (!part) throw new Error(`${pathname} は束ねた応答に入っていない`);
  return JSON.parse(part.body) as T;
}

/** 始めてからの `GET <pathname>` の回数（束ねた中の要求も 1 本と数える）を返す。取り直しが増えていないことを押さえるのに使う */
export function countFetches(page: Page, pathname: string): () => number {
  let count = 0;
  page.on('request', (request) => {
    if (request.method() !== 'GET') return;
    count += carriedUrls(request.url()).filter((url) => url.pathname === pathname).length;
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
 * 取得が落ち着いてから `GET <pathname>` を数え始め、それからの回数を返す。
 * 開いた直後の取得を、操作したことによる取得と取り違えないようにする
 */
export async function fetchesFromNow(page: Page, pathname: string): Promise<() => number> {
  const fetches = countFetches(page, pathname);
  await quiet(page, fetches);
  const before = fetches();
  return () => fetches() - before;
}
