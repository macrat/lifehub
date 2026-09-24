import { devices, expect, test } from '@playwright/test';
import { detailAction } from './detail.ts';
import { login } from './login.ts';
import { stall } from './network.ts';
import { touchDrag } from './touch.ts';

test.use({ ...devices['Pixel 7'] });

test.beforeEach(async ({ page }) => {
  await login(page);
});

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

test('カレンダーに追加した予定は通信を待たずに出る', async ({ page }) => {
  const title = `楽観的な予定 ${Date.now()}`;
  await page.goto('/calendar?view=day&date=2030-02-04');

  // 予定の追加は日表示の下書きから始まる。スマホは全項目の段（画面いっぱい）で開く
  await page.getByRole('button', { name: '追加' }).click();
  await page.getByRole('menuitem', { name: '予定' }).click();
  const sheet = page.locator('[data-sheet]');
  await expect(sheet).toBeVisible();
  await expect.poll(async () => (await sheet.boundingBox())?.y).toBe(0);
  await page.getByLabel('タイトルを追加').fill(title);
  // 追加ボタンからの予定は終日で始まる
  await page.getByLabel('終日').uncheck();
  await page.getByLabel('開始').fill('2030-02-04T09:00');
  await page.getByLabel('終了').fill('2030-02-04T10:00');
  // 保存（/api/events）とその後の取り直し（/api/calendar）の両方を遅らせる
  await stall(page, '**/api/{events,calendar}**', 1500);
  await page.getByRole('button', { name: '保存' }).click();

  await expect(sheet).toHaveCount(0, { timeout: 3000 });
  await expect(page.getByRole('button', { name: title })).toBeVisible({ timeout: 3000 });

  // 保存と再取得が終わっても、投機的に出した分と二重にならない
  await page.waitForTimeout(4000);
  await expect(page.getByRole('button', { name: title })).toHaveCount(1);
});

test('保存に失敗したら投機的な表示を取り消し、理由を通知で伝える', async ({ page }) => {
  await page.goto('/expenses');
  await expect(page.getByText('残高')).toBeVisible();

  await page.route('**/api/expenses', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: '保存できませんでした（テスト）' }),
    });
  });

  await page.getByRole('button', { name: '立替を追加' }).click();
  await page.getByLabel('金額（円）').fill('4321');
  await page.getByLabel('内容', { exact: true }).fill('失敗する立替');
  await page.getByRole('button', { name: '保存' }).click();

  // フォームは返事を待たずに閉じる。投機的に出した行は消え、理由は通知で出る
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('保存できませんでした（テスト）')).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: '失敗する立替' })).toHaveCount(0);

  // 入れ直せば保存できる
  await page.unroute('**/api/expenses');
  await page.getByRole('button', { name: '立替を追加' }).click();
  await page.getByLabel('金額（円）').fill('4321');
  await page.getByLabel('内容', { exact: true }).fill('直した立替');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('直した立替')).toBeVisible();

  // 残高はテスト間で共有の DB から計算されるので、作った立替は消しておく
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: /直した立替/ }).click();
  await detailAction(page, '削除');
  await expect(page.getByText('直した立替')).toHaveCount(0);
});
