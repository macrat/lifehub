import type { Locator, Page } from '@playwright/test';

/**
 * 画面の枠（AppBar・下部ナビ）と、要素の位置を測る道具。
 * 「AppBar の下に見えているか」「下部ナビのすぐ上か」のような、画面の枠を基準にした位置の確かめ方に使う。
 */

/** 画面の上の AppBar */
export const appBar = (page: Page) => page.getByRole('banner');

/** スマホの下部ナビ（画面の最後の navigation） */
export const bottomNav = (page: Page) => page.getByRole('navigation').last();

/** 要素の下端の、画面の上からの位置（見つからなければ 0） */
export async function bottomOf(locator: Locator): Promise<number> {
  const box = await locator.first().boundingBox();
  return (box?.y ?? 0) + (box?.height ?? 0);
}
