import { devices, expect, test } from '@playwright/test';
import { detailAction } from './detail.ts';
import { E2E_USER } from './global-setup.ts';

/** 記録をタップして開く詳細は予定・立替・レモンで同じ形なので、代表してレモンで一通りなぞる */
test.use({ ...devices['Pixel 7'] });

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill(E2E_USER.email);
  await page.getByLabel('パスワード').fill(E2E_USER.password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page).toHaveURL('/');
});

test('記録をタップすると読むだけのシートが出て、鉛筆で広がって編集できる', async ({ page }) => {
  const note = `E2E 詳細 ${Date.now()}`;
  await page.goto('/lemon');

  await page.getByRole('button', { name: 'レモンの記録を追加' }).click();
  await page.getByLabel('メモ', { exact: true }).fill(note);
  await page.getByRole('button', { name: '保存' }).click();
  const row = page.getByRole('button', { name: new RegExp(note) });
  await expect(row).toBeVisible();

  // タップすると読むだけのシート。入力欄は無く、鉛筆と三点リーダーだけが出る
  const sheet = page.locator('[data-sheet]');
  const settled = async () => {
    await expect.poll(() => sheet.evaluate((el) => el.getAnimations().length)).toBe(0);
    const box = await sheet.boundingBox();
    if (!box) throw new Error('シートが見つからない');
    return box;
  };
  await row.click();
  const viewing = await settled();
  await expect(page.getByLabel('メモ', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'その他の操作' })).toBeVisible();

  // 鉛筆を押すと、同じシートの中が入力欄に変わって下端はそのままに上へ広がる
  await page.getByRole('button', { name: '編集' }).click();
  await expect(page.getByLabel('メモ', { exact: true })).toHaveValue(note);
  const editing = await settled();
  expect(editing.height).toBeGreaterThan(viewing.height);
  expect(Math.round(editing.y + editing.height)).toBe(Math.round(viewing.y + viewing.height));

  // 直して保存すると一覧に反映される
  await page.getByLabel('メモ', { exact: true }).fill(`${note}（直した）`);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByText(`${note}（直した）`)).toBeVisible();

  // 削除は三点リーダーの中
  page.once('dialog', (dialog) => dialog.accept());
  await row.click();
  await detailAction(page, '削除');
  await expect(page.getByText(`${note}（直した）`)).toHaveCount(0);
});
