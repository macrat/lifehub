import { devices, expect, test } from '@playwright/test';
import { login } from './login.ts';
import { touchDrag } from './touch.ts';

/** スワイプはタッチのみ。デスクトップの設定ではなくスマホの設定で動かす */
test.use({ ...devices['Pixel 7'] });

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('カレンダーを左右にスワイプすると前後の月・週へ 1 つずつ移る', async ({ page }) => {
  /** 指で (from → to) までなぞって離し、慣性と吸着が終わるまで待つ */
  const drag = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    await touchDrag(page, from, to, { steps: 12, delay: 16 });
    await page.waitForTimeout(800);
  };
  const date = () => new URL(page.url()).searchParams.get('date');

  // 月表示: 左へスワイプすると翌月、右へスワイプすると元の月。1 回のスワイプで 1 か月だけ動く
  await page.goto('/calendar?view=month&date=2030-01-15');
  await expect(page.getByText('2030年01月')).toBeVisible();
  await drag({ x: 380, y: 400 }, { x: 30, y: 400 });
  await expect(page.getByText('2030年02月')).toBeVisible();
  expect(date()).toBe('2030-02-01');
  await drag({ x: 30, y: 400 }, { x: 380, y: 400 });
  await expect(page.getByText('2030年01月')).toBeVisible();
  expect(date()).toBe('2030-01-01');

  // 週表示: 時間軸を縦に動かしてからスワイプしても、見ていた時間帯は保たれる
  await page.goto('/calendar?view=week&date=2030-01-16');
  await expect(page.getByText('2030年01月14日〜20日')).toBeVisible();
  const timeGrid = page.locator('[data-sync-scroll]').nth(1);
  await timeGrid.evaluate((el) => {
    el.scrollTop = 420;
  });
  await drag({ x: 380, y: 500 }, { x: 30, y: 500 });
  await expect(page.getByText('2030年01月21日〜27日')).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('[data-sync-scroll]')
        .nth(1)
        .evaluate((el) => el.scrollTop),
    )
    .toBe(420);

  // 縦になぞるのは時間軸のスクロール。日付は動かない
  const before = date();
  await drag({ x: 300, y: 600 }, { x: 290, y: 300 });
  expect(date()).toBe(before);
});
