import { devices, expect, test } from '@playwright/test';
import { touchDrag } from './touch.ts';

/** スワイプはタッチのみ。デスクトップの設定ではなくスマホの設定で動かす */
test.use({ ...devices['Pixel 7'] });

test('カレンダーを左右にスワイプすると前後の月・週へ 1 つずつ移る', async ({ page }) => {
  type Point = { x: number; y: number };
  /**
   * 指で横に (from → to) までなぞって離し、慣性と吸着が終わる（横に並べた面の scrollend）まで待つ。
   * 吸着し終えた所でページが移る（`SwipePager`）ので、待った後の日付が 1 回のスワイプの結果になる。
   * scrollend は泡立たないので document の捕捉で受け、なぞる前から待ち始める
   */
  const swipe = async (from: Point, to: Point) => {
    const settled = page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const onEnd = (event: Event) => {
            if (!(event.target instanceof Element)) return;
            if (!getComputedStyle(event.target).scrollSnapType.startsWith('x')) return;
            document.removeEventListener('scrollend', onEnd, true);
            resolve();
          };
          document.addEventListener('scrollend', onEnd, true);
        }),
    );
    await touchDrag(page, from, to, { steps: 12, delay: 16 });
    await settled;
  };
  const date = () => new URL(page.url()).searchParams.get('date');

  // 月表示: 左へスワイプすると翌月、右へスワイプすると元の月。1 回のスワイプで 1 か月だけ動く
  await page.goto('/calendar?view=month&date=2030-01-15');
  await expect(page.getByText('2030年01月')).toBeVisible();
  await swipe({ x: 380, y: 400 }, { x: 30, y: 400 });
  await expect(page.getByText('2030年02月')).toBeVisible();
  expect(date()).toBe('2030-02-01');
  await swipe({ x: 30, y: 400 }, { x: 380, y: 400 });
  await expect(page.getByText('2030年01月')).toBeVisible();
  expect(date()).toBe('2030-01-01');

  // 週表示: 時間軸を縦に動かしてからスワイプしても、見ていた時間帯は保たれる
  await page.goto('/calendar?view=week&date=2030-01-16');
  await expect(page.getByText('2030年01月14日〜20日')).toBeVisible();
  const timeGrid = page.locator('[data-sync-scroll]').nth(1);
  await timeGrid.evaluate((el) => {
    el.scrollTop = 420;
  });
  await swipe({ x: 380, y: 500 }, { x: 30, y: 500 });
  await expect(page.getByText('2030年01月21日〜27日')).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('[data-sync-scroll]')
        .nth(1)
        .evaluate((el) => el.scrollTop),
    )
    .toBe(420);

  // 縦になぞるのは時間軸のスクロール。日付は動かない（動かないことは待つ当てが無いので、
  // 慣性と吸着が確かに終わる長さだけ待ってから見る）
  const before = date();
  await touchDrag(page, { x: 300, y: 600 }, { x: 290, y: 300 }, { steps: 12, delay: 16 });
  await page.waitForTimeout(800);
  expect(date()).toBe(before);
});
