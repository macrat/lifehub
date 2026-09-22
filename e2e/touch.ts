import type { Page } from '@playwright/test';

/** CDP に送る指 1 本。複数本なら id で見分ける */
type TouchPoint = { id: number; x: number; y: number };

/**
 * 指を触れさせ、`at` が返す位置を 0→1 でたどって離す（`at` は指の本数も決める）。
 * Playwright の touchscreen はタップだけなので、CDP で touchstart〜touchend を送る。
 * hold は動かし始めるまで押さえている時間（ミリ秒。月表示の長押しに使う）。
 * steps / delay は刻みの細かさと間隔。慣性や吸着を見るときだけ細かくゆっくり送る。
 */
async function touchGesture(
  page: Page,
  at: (t: number) => TouchPoint[],
  { hold = 0, steps = 5, delay = 0 } = {},
) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
  if (hold > 0) await page.waitForTimeout(hold);
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(i / steps) });
    if (delay > 0) await page.waitForTimeout(delay);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** 指 1 本でのなぞり。from から to へ動かす */
export function touchDrag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  options: { hold?: number; steps?: number; delay?: number } = {},
) {
  return touchGesture(
    page,
    (t) => [{ id: 0, x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }],
    options,
  );
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
