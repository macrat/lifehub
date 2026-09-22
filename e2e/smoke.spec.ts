import { expect, type Page, test } from '@playwright/test';
import { E2E_USER } from './global-setup.ts';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill(E2E_USER.email);
  await page.getByLabel('パスワード').fill(E2E_USER.password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page).toHaveURL('/');
}

/** サーバーに保存されているログイン中のユーザーの色相 */
async function hue(page: Page): Promise<number> {
  const res = await page.request.get('/api/me');
  return (await res.json()).hue;
}

/** 画面上部の取得・保存中インジケータの色。アクセントカラー（primary）がそのまま出る所 */
function accentColor(page: Page): Promise<string> {
  return page
    .getByRole('progressbar')
    .locator('.MuiLinearProgress-bar')
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
}

test('API が DB に接続できる', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual({ ok: true, db: true });
});

test('未ログインではログイン画面に送られ、ログインするとホームが表示される', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel('メールアドレス').fill(E2E_USER.email);
  await page.getByLabel('パスワード').fill('wrong-password-123');
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page.getByText('メールアドレスまたはパスワードが違います')).toBeVisible();

  await page.getByLabel('パスワード').fill(E2E_USER.password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: '今日' })).toBeVisible();

  // 設定（PC はサイドナビ）→ ユーザー管理へ移動し、自分が一覧に出る
  await page.getByRole('link', { name: '設定' }).click();
  await page.getByRole('link', { name: /ユーザー管理/ }).click();
  await expect(page).toHaveURL('/admin/users');
  await expect(page.getByText(E2E_USER.email)).toBeVisible();

  // 設定からログアウトするとログイン画面に戻る
  await page.getByRole('link', { name: '設定' }).click();
  await page.getByRole('button', { name: /ログアウト/ }).click();
  await expect(page).toHaveURL(/\/login/);
});

test('設定画面が表示される', async ({ page }) => {
  await login(page);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'プッシュ通知' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'この端末で通知を受け取る' })).toBeVisible();
  await expect(page.getByRole('slider', { name: '色' })).toBeVisible();
  // バージョンはビルド時の define で埋め込む。埋め込みが外れると値ごと消えるので中身まで見る
  await expect(page.getByRole('heading', { name: 'バージョン' })).toBeVisible();
  await expect(page.getByText(/^[0-9a-f]{7}$/)).toBeVisible();
});

test('選んだ色はその場でアクセントカラーになり、保存するまで保存されない', async ({ page }) => {
  await login(page);
  await page.goto('/settings');
  const slider = page.getByRole('slider', { name: '色' });
  await expect(slider).toBeVisible();
  const savedColor = await accentColor(page);
  const savedHue = await hue(page);

  // 選んだ色は、保存する前から画面全体（ここでは上部のインジケータ）に出る
  await slider.press('Home');
  await expect.poll(() => accentColor(page)).not.toBe(savedColor);
  const pickedColor = await accentColor(page);
  expect(await hue(page)).toBe(savedHue);

  // 保存しないまま設定画面を離れれば、保存済みの色に戻る
  await page.getByRole('link', { name: 'ホーム' }).click();
  await expect(page).toHaveURL('/');
  await expect.poll(() => accentColor(page)).toBe(savedColor);

  // 保存ボタンを押すとサーバーに送られ、その色が保存済みの色になる
  await page.goto('/settings');
  await slider.press('Home');
  const saving = page.waitForResponse((res) => res.request().method() === 'PATCH');
  await page.getByRole('button', { name: '保存' }).click();
  expect((await saving).ok()).toBe(true);
  await expect(page.getByRole('button', { name: '保存' })).toBeDisabled();
  await expect.poll(() => accentColor(page)).toBe(pickedColor);
  // Home キーで選べる最小の色相
  expect(await hue(page)).toBe(0);
});
