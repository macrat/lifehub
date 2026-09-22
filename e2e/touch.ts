import type { Page } from '@playwright/test';

/**
 * 指でのなぞり（タッチ）。Playwright の touchscreen はタップだけなので、CDP で touchstart〜touchend を送る。
 * hold はなぞり始めるまで押さえている時間（ミリ秒。月表示の長押しに使う）。
 */
export async function touchDrag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  { hold = 0 } = {},
) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  if (hold > 0) await page.waitForTimeout(hold);
  const steps = 5;
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        {
          x: from.x + ((to.x - from.x) * i) / steps,
          y: from.y + ((to.y - from.y) * i) / steps,
        },
      ],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/**
 * 2 本の指でつまんで拡げ縮めする（ピンチ）。center を挟んで縦に並べた 2 点の間隔を from → to へ変える。
 * touchDrag と同じく CDP で送る（Playwright の touchscreen は指 1 本のタップだけ）。
 */
export async function touchPinch(
  page: Page,
  center: { x: number; y: number },
  from: number,
  to: number,
) {
  const cdp = await page.context().newCDPSession(page);
  const points = (gap: number) => [
    { id: 0, x: center.x, y: center.y - gap / 2 },
    { id: 1, x: center.x, y: center.y + gap / 2 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(from) });
  const steps = 5;
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: points(from + ((to - from) * i) / steps),
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
