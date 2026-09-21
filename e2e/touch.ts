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
