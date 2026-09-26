import { devices, expect, test } from '@playwright/test';
import { stall } from './network.ts';
import { touchDrag } from './touch.ts';

test.use({ ...devices['Pixel 7'] });

test('スマホでは項目の少ないフォームが画面の下のシートで開き、保存すると通信を待たずに閉じて記録が出る', async ({
  page,
}) => {
  await page.goto('/lemon');
  await expect(page.getByText('水やり').first()).toBeVisible();

  await page.getByRole('button', { name: 'レモンの記録を追加' }).click();

  // 画面の下端から、中身の高さのぶんだけ出る。項目が少ないので画面の下半分に収まり、後ろの履歴は見えたまま
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('画面の大きさが分からない');
  const sheet = page.locator('[data-sheet]');
  await expect(sheet).toBeVisible();
  await expect.poll(() => sheet.evaluate((el) => el.getAnimations().length)).toBe(0);
  const box = await sheet.boundingBox();
  if (!box) throw new Error('シートが見つからない');
  expect(box.x).toBe(0);
  expect(box.width).toBe(viewport.width);
  expect(Math.round(box.y + box.height)).toBe(viewport.height);
  expect(box.height).toBeLessThan(viewport.height / 2);

  // 閉じるは左上のバツ、保存は右上（どこまで下げていても押せる位置）
  const close = await page.getByRole('button', { name: '閉じる' }).boundingBox();
  const save = await page.getByRole('button', { name: '保存' }).boundingBox();
  if (!close || !save) throw new Error('シートの操作ボタンが見つからない');
  expect(close.x).toBeLessThan(viewport.width / 2);
  expect(save.x).toBeGreaterThan(viewport.width / 2);
  expect(close.y).toBeLessThan(box.y + 80);
  expect(save.y).toBeLessThan(box.y + 80);

  // つまむ帯から下へなぞると閉じる
  const x = viewport.width / 2;
  await touchDrag(page, { x, y: box.y + 8 }, { x, y: box.y + 128 });
  await expect(sheet).toHaveCount(0);

  // 開き直して保存する
  await page.getByRole('button', { name: 'レモンの記録を追加' }).click();
  await page.getByLabel('メモ', { exact: true }).fill('楽観的更新のテスト');
  await stall(page, '**/api/lemon/**');
  await page.getByRole('button', { name: '保存' }).click();

  // 保存も再取得も返らないうちに、閉じて記録と状態（今日）が出る
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 3000 });
  await expect(page.getByText('楽観的更新のテスト')).toBeVisible({ timeout: 3000 });
  await expect(page.getByText('今日').first()).toBeVisible({ timeout: 3000 });
});
