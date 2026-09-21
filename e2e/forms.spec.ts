import { devices, expect, type Page, test } from '@playwright/test';
import { E2E_USER } from './global-setup.ts';

test.use({ ...devices['Pixel 7'] });

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill(E2E_USER.email);
  await page.getByLabel('パスワード').fill(E2E_USER.password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page).toHaveURL('/');
});

/** 指定したパスの通信を遅らせる（保存も再取得も返ってこない状況を作る） */
async function stall(page: Page, path: string, ms = 10_000) {
  await page.route(path, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await route.continue();
  });
}

test('スマホでは追加フォームが全画面で開き、保存すると通信を待たずに閉じて記録が出る', async ({
  page,
}) => {
  await page.goto('/lemon');
  await expect(page.getByText('水やり').first()).toBeVisible();

  await page.getByRole('button', { name: 'レモンの記録を追加' }).click();

  // ページが切り替わったように、画面いっぱい・戻る矢印つきで開く
  const viewport = page.viewportSize();
  await expect
    .poll(() => page.locator('.MuiDialog-paper').boundingBox())
    .toMatchObject({ x: 0, y: 0, width: viewport?.width, height: viewport?.height });
  await expect(page.getByRole('button', { name: '戻る' })).toBeVisible();

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

  await page.getByRole('button', { name: '追加' }).click();
  await page.getByRole('menuitem', { name: '予定' }).click();
  await page.getByLabel('タイトル').fill(title);
  await page.getByLabel('開始').fill('2030-02-04T09:00');
  await page.getByLabel('終了').fill('2030-02-04T10:00');
  await stall(page, '**/api/events**', 1500);
  await page.getByRole('button', { name: '保存' }).click();

  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 3000 });
  await expect(page.getByRole('button', { name: title })).toBeVisible({ timeout: 3000 });

  // 保存と再取得が終わっても、投機的に出した分と二重にならない
  await page.waitForTimeout(4000);
  await expect(page.getByRole('button', { name: title })).toHaveCount(1);
});

test('保存に失敗したら投機的な表示を取り消し、入力したままフォームを開き直す', async ({ page }) => {
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

  // 投機的に出した行は消え、入力したままのフォームが理由つきで戻る
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('保存できませんでした（テスト）')).toBeVisible();
  await expect(page.getByLabel('金額（円）')).toHaveValue('4321');
  await expect(page.getByLabel('内容', { exact: true })).toHaveValue('失敗する立替');
  await expect(page.getByRole('listitem').filter({ hasText: '失敗する立替' })).toHaveCount(0);

  // 直して保存し直せる
  await page.unroute('**/api/expenses');
  await page.getByLabel('内容', { exact: true }).fill('直した立替');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('直した立替')).toBeVisible();

  // 残高はテスト間で共有の DB から計算されるので、作った立替は消しておく
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: /直した立替/ }).click();
  await page.getByRole('button', { name: '削除' }).click();
  await expect(page.getByText('直した立替')).toHaveCount(0);
});
