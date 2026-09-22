import { expect, test } from '@playwright/test';
import { login } from './login.ts';

/** manifest（`vite.config.ts`）に並べたショートカット */
type Shortcut = { name: string; url: string };

test.beforeEach(async ({ page }) => {
  await login(page);
});

/**
 * PWA のショートカット（ホーム画面のアイコンの長押し、タスクバーの右クリック）。
 * ランチャーが開くのは manifest に書いた URL そのものなので、manifest から読んだ URL を
 * そのまま開いて、狙った画面と入力が出ることを確かめる。
 */
test('ショートカットの URL がそれぞれの画面と入力を開く', async ({ page }) => {
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  const shortcuts: Shortcut[] = manifest.shortcuts;
  const urlOf = (name: string): string => {
    const shortcut = shortcuts.find((s) => s.name === name);
    if (!shortcut) throw new Error(`${name} のショートカットが manifest に無い`);
    return shortcut.url;
  };

  // カレンダー: 月表示
  await page.goto(urlOf('カレンダー'));
  await expect(page.getByRole('button', { name: '表示の切替' })).toHaveText('月');

  // 予定登録: 日表示に既定の時間帯の下書きを置いて、クイック入力が開く
  // （入力が前に出ている間は後ろの AppBar を読めないので、表示の種類は URL で見る）
  await page.goto(urlOf('予定登録'));
  await expect(page).toHaveURL(/view=day/);
  await expect(page.getByLabel('タイトルを追加')).toBeVisible();

  // タスク登録
  await page.goto(urlOf('タスク登録'));
  await expect(page.getByRole('dialog', { name: 'タスクを追加' })).toBeVisible();

  // 立替登録
  await page.goto(urlOf('立替登録'));
  await expect(page.getByRole('dialog', { name: '立替を追加' })).toBeVisible();

  // レモンの記録
  await page.goto(urlOf('レモンの記録'));
  await expect(page.getByRole('dialog', { name: 'レモンの記録を追加' })).toBeVisible();
  // しるしは使うと消えるので、再読み込みや戻るで開き直さない
  await expect(page).toHaveURL('/lemon');
});
