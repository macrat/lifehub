import { expect, type Page, test } from '@playwright/test';
import { apiOf } from './api.ts';
import { SIGNED_OUT } from './auth.ts';
import { E2E_USER } from './global-setup.ts';
import { carries } from './network.ts';

/** サーバーに保存されているログイン中のユーザーの色相 */
async function hue(page: Page): Promise<number> {
  return (await apiOf(page.request).me.get.query()).hue;
}

/** サーバーに保存されているログイン中のユーザーの終日の通知時刻（0:00 からの分） */
async function notifyMinutes(page: Page): Promise<number> {
  return (await apiOf(page.request).me.get.query()).allDayNotifyMinutes;
}

/** 画面上部の取得・保存中インジケータの色。アクセントカラー（primary）がそのまま出る所 */
function accentColor(page: Page): Promise<string> {
  return page
    .getByRole('progressbar')
    .locator('.MuiLinearProgress-bar')
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
}

test.describe('ログインしていないとき', () => {
  // ログアウトで消えるのはこのテストがログインしたセッションだけで、他のテストのログイン状態は残る
  test.use({ storageState: SIGNED_OUT });

  test('ログイン画面に送られ、ログインするとホームが表示され、ログアウトで戻る', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);

    await page.getByLabel('メールアドレス').fill(E2E_USER.email);
    await page.getByLabel('パスワード').fill('wrong-password-123');
    await page.getByRole('button', { name: 'ログイン' }).click();
    await expect(page.getByText('メールアドレスまたはパスワードが違います')).toBeVisible();

    await page.getByLabel('パスワード').fill(E2E_USER.password);
    await page.getByRole('button', { name: 'ログイン' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByLabel('記録を検索')).toBeVisible();

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
});

test('設定画面が表示される', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'プッシュ通知' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'この端末で通知を受け取る' })).toBeVisible();
  await expect(page.getByRole('slider', { name: '色' })).toBeVisible();
  // バージョンはビルド時の define で埋め込む。埋め込みが外れると値ごと消えるので中身まで見る
  await expect(page.getByRole('heading', { name: 'バージョン' })).toBeVisible();
  await expect(page.getByText(/^[0-9a-f]{7}$/)).toBeVisible();
});

test('選んだ色はその場でアクセントカラーになり、保存するまで保存されない', async ({ page }) => {
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
  const saving = page.waitForResponse(carries('users.update'));
  const save = page.getByRole('region', { name: '色' }).getByRole('button', { name: '保存' });
  await save.click();
  expect((await saving).ok()).toBe(true);
  await expect(save).toBeDisabled();
  await expect.poll(() => accentColor(page)).toBe(pickedColor);
  // Home キーで選べる最小の色相
  expect(await hue(page)).toBe(0);
});

test('終日の通知時刻は設定画面で選び、保存ボタンで保存する', async ({ page }) => {
  await page.goto('/settings');
  const section = page.getByRole('region', { name: '終日の通知' });
  const time = section.getByLabel('時刻');
  const save = section.getByRole('button', { name: '保存' });
  await expect(save).toBeDisabled();

  // 前の実行で保存した時刻と重ならないよう、今の値と違う時刻を選ぶ
  const saved = await notifyMinutes(page);
  const next =
    saved === 6 * 60 + 30
      ? { value: '07:15', minutes: 7 * 60 + 15 }
      : { value: '06:30', minutes: 6 * 60 + 30 };
  await time.fill(next.value);
  const saving = page.waitForResponse(carries('users.update'));
  await save.click();
  expect((await saving).ok()).toBe(true);
  await expect(save).toBeDisabled();
  expect(await notifyMinutes(page)).toBe(next.minutes);
});
