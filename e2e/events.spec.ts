import { expect, test } from '@playwright/test';
import { E2E_USER } from './global-setup.ts';

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill(E2E_USER.email);
  await page.getByLabel('パスワード').fill(E2E_USER.password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page).toHaveURL('/');
});

test('繰り返し予定を作成し、この回だけ変更し、削除できる', async ({ page }) => {
  const title = `E2E 週次 ${Date.now()}`;
  await page.goto('/calendar?view=week&date=2030-01-07');

  // 作成（毎週）
  // SpeedDial はホバーで開く（クリックだと開閉が反転する）
  await page.getByRole('button', { name: '追加' }).hover();
  await page.getByRole('menuitem', { name: '予定' }).click();
  await page.getByLabel('タイトル').fill(title);
  await page.getByLabel('開始').fill('2030-01-07T09:00');
  await page.getByLabel('終了').fill('2030-01-07T10:00');
  await page.getByLabel('繰り返し', { exact: true }).click();
  await page.getByRole('option', { name: '毎週' }).click();
  await page.getByRole('button', { name: '保存' }).click();
  // 週表示はタイムライン。予定はブロック（ボタン）として出る
  await expect(page.getByRole('button', { name: title })).toBeVisible();

  // 翌週に移動しても表示される
  await page.goto('/calendar?view=week&date=2030-01-14');
  await expect(page.getByRole('button', { name: title })).toBeVisible();

  // この回だけタイトルを変更
  await page.getByRole('button', { name: title }).click();
  await page.getByRole('button', { name: '編集' }).click();
  await page.getByRole('button', { name: 'この回だけ' }).click();
  await page.getByLabel('タイトル').fill(`${title}（変更）`);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByRole('button', { name: `${title}（変更）` })).toBeVisible();

  // 元の週は変わっていない
  await page.goto('/calendar?view=week&date=2030-01-07');
  await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible();

  // すべて削除
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: title, exact: true }).click();
  await page.getByRole('button', { name: '削除' }).click();
  await page.getByRole('button', { name: /^すべて / }).click();
  await expect(page.getByRole('button', { name: title, exact: true })).toHaveCount(0);
});

test('週表示で時間をドラッグして予定を作れる', async ({ page }) => {
  const title = `E2E ドラッグ ${Date.now()}`;
  await page.goto('/calendar?view=week&date=2031-06-04');

  // 時間軸の列（1 列 = 24 時間）の上端を基準に、9:00 の枠から 10:15〜10:30 の枠までドラッグする
  const column = page.locator('[data-date="2031-06-05"]');
  const box = await column.boundingBox();
  if (!box) throw new Error('時間軸の列が見つからない');
  const x = box.x + box.width / 2;
  const y = (minutes: number) => box.y + (minutes / 60) * (box.height / 24);
  await page.mouse.move(x, y(9 * 60 + 5));
  await page.mouse.down();
  await page.mouse.move(x, y(10 * 60 + 20), { steps: 5 });
  await page.mouse.up();

  // 選んだ時間帯が入った状態で予定のフォームが開く
  await expect(page.getByLabel('開始')).toHaveValue('2031-06-05T09:00');
  await expect(page.getByLabel('終了')).toHaveValue('2031-06-05T10:30');
  await page.getByLabel('タイトル').fill(title);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByRole('button', { name: title })).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: title }).click();
  await page.getByRole('button', { name: '削除' }).click();
  await expect(page.getByRole('button', { name: title })).toHaveCount(0);
});
