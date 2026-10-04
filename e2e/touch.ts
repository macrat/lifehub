import type { Locator, Page } from '@playwright/test';
import { expect } from './test.ts';

/** CDP に送る指 1 本。複数本なら id で見分ける */
type TouchPoint = { id: number; x: number; y: number };

type GestureOptions = {
  hold?: number;
  steps?: number;
  delay?: number;
  afterStart?: () => Promise<unknown>;
};

/**
 * 指を触れさせ、`at` が返す位置を 0→1 でたどって離す（`at` は指の本数も決める）。
 * Playwright の touchscreen はタップだけなので、CDP で touchstart〜touchend を送る。
 * hold は動かし始めるまで押さえている時間（ミリ秒。月表示の長押しに使う）。
 * steps / delay は刻みの細かさと間隔。慣性や吸着を見るときだけ細かくゆっくり送る。
 * afterStart は触れた直後、動かし始める前にする事（指の下の要素を描き直す、など）。
 */
async function touchGesture(
  page: Page,
  at: (t: number) => TouchPoint[],
  { hold = 0, steps = 5, delay = 0, afterStart }: GestureOptions = {},
) {
  // セッションは閉じない（ページを閉じれば一緒に消える）。閉じると、Playwright がかけた
  // ネットワークの設定（`context.setOffline`）まで外れてオンラインに戻る
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
  await afterStart?.();
  if (hold > 0) await page.waitForTimeout(hold);
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(i / steps) });
    if (delay > 0) await page.waitForTimeout(delay);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** 長押しと認められるまで押さえる長さ（ms）。アプリの区切り（`use-record-press.ts` の 300ms）を確かに超える */
export const LONG_PRESS_HOLD_MS = 400;

/** 指 1 本でのなぞり。from から to へ動かす */
export function touchDrag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  options: GestureOptions = {},
) {
  return touchGesture(
    page,
    (t) => [{ id: 0, x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }],
    options,
  );
}

/** その要素の中心（行・予定のブロック・帯、つまむ丸など、押す所・つまむ所を指すのに使う） */
export async function centerOf(locator: Locator) {
  const box = await settledBox(locator);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** 要素の画面内での場所と大きさ */
type Box = NonNullable<Awaited<ReturnType<Locator['boundingBox']>>>;

/**
 * 動きが止まってから測る。押す所が動いている最中に測ると、指を下ろす頃には別の所を指している
 * （カレンダーはシートが開くと、隠れた枠を見える所まで滑らかに送る）。
 * 滑らかなスクロールは `getAnimations` に出ないので、同じ所に 2 回続けて見えたら止まったとみなす。
 * 刻みは既定より細かくして、止まっている物を待つ時間を詰める。
 */
export async function settledBox(locator: Locator) {
  /** 最後に測った所。止まったと分かった時点の値をそのまま返す（測り直すとまた動いた後になる） */
  const last: { box: Box | null; previous: Box | null } = { box: null, previous: null };
  await expect
    .poll(
      async () => {
        last.previous = last.box;
        last.box = await locator.boundingBox();
        return Boolean(last.box && last.previous && last.box.y === last.previous.y);
      },
      { intervals: [16, 32, 64, 128, 250] },
    )
    .toBe(true);
  if (!last.box) throw new Error('押す所が見つからない');
  return last.box;
}

/**
 * その要素を長押しする（動かさずに押さえたまま待って離す）。
 * アプリの区切りは 300ms なので、それを確かに超える長さで押さえる。
 */
export async function longPress(page: Page, target: Locator) {
  const at = await centerOf(target);
  await touchDrag(page, at, at, { hold: LONG_PRESS_HOLD_MS });
}

/**
 * 2 本の指でつまんで拡げ縮めする（ピンチ）。center を挟んで縦に並べた 2 点の間隔を from → to へ変える。
 */
export function touchPinch(page: Page, center: { x: number; y: number }, from: number, to: number) {
  return touchGesture(page, (t) => {
    const gap = from + (to - from) * t;
    return [
      { id: 0, x: center.x, y: center.y - gap / 2 },
      { id: 1, x: center.x, y: center.y + gap / 2 },
    ];
  });
}
