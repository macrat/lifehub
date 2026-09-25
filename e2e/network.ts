import type { Page } from '@playwright/test';

/** 指定したパスの通信を遅らせる（保存も再取得も返ってこない状況を作る） */
export async function stall(page: Page, path: string, ms = 10_000) {
  await page.route(path, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await route.continue();
  });
}

/** 始めてからの `GET <pathname>` の回数を返す。取り直しが増えていないことを押さえるのに使う */
export function countFetches(page: Page, pathname: string): () => number {
  let count = 0;
  page.on('request', (request) => {
    if (request.method() === 'GET' && new URL(request.url()).pathname === pathname) count++;
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
