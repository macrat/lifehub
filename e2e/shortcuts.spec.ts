import { expect, test } from '@playwright/test';

/**
 * 入力を開く PWA のショートカット（ホーム画面のアイコンの長押し、タスクバーの右クリック）。
 * ランチャーが開くのは manifest に書いた URL そのものなので、manifest から読んだ URL を
 * そのまま開いて、しるし（`add`）が狙った入力を開くことを確かめる。
 * 画面を開くだけのショートカットは URL が正しければよいので、`src/lib/__tests__/shortcuts.test.ts` で見る。
 */
test('ショートカットの URL がそれぞれの入力を開く', async ({ page }) => {
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  const shortcuts: { name: string; url: string }[] = manifest.shortcuts;
  const urlOf = (name: string): string => {
    const shortcut = shortcuts.find((s) => s.name === name);
    if (!shortcut) throw new Error(`${name} のショートカットが manifest に無い`);
    return shortcut.url;
  };

  // 予定登録: 既定の時間帯の下書きを置いて、クイック入力が開く
  await page.goto(urlOf('予定登録'));
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
