import { expect, type Page, test } from '@playwright/test';
import { myId, openHome } from './auth.ts';
import { addRecord, deleteRecord, expenseHistory } from './history.ts';

/**
 * 閉じたダイアログのぶんの履歴が戻りきるのを待つ（重なったダイアログを一度に閉じると 1 つ余る）。
 * 開いているダイアログの数は history の state が持つ（`useDialogHistory`）。
 * 文字列で渡すのは、この tsconfig が DOM の型を持たないため。
 */
function settled(page: Page) {
  return expect.poll(() => page.evaluate<number>('history.state?.dialogs ?? 0')).toBe(0);
}

/**
 * ダイアログは開いている間だけ履歴に項目を持つ（`useDialogHistory`）。
 * 戻る操作で閉じるのはダイアログだけで、その後ろのページは飛び越さない。
 */
test('立替の詳細・編集は戻るで閉じ、一覧は飛び越さない', async ({ page }) => {
  const description = `E2E 履歴 ${Date.now()}`;
  const expense = await addRecord(page, expenseHistory, await myId(page), new Date(), description);
  // 戻る先（前の画面）としてホームを開いておく
  await openHome(page);
  await page.goto('/expenses');
  const row = page.getByRole('button', { name: new RegExp(description) });
  await expect(row).toBeVisible();

  // 詳細だけを開いて戻る
  await row.click();
  await expect(page.getByRole('heading', { name: description })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL('/expenses');

  // 編集は同じ詳細の中で入力欄に変わるだけなので、戻ると詳細ごと閉じる（履歴は 1 つのまま）
  await row.click();
  await page.getByRole('button', { name: '編集' }).click();
  await expect(page.getByLabel('金額（円）')).toHaveValue('100');
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL('/expenses');
  await expect(row).toBeVisible();
  await settled(page);

  // ここでようやく前の画面へ戻る（ダイアログのぶんの履歴は残っていない）
  await page.goBack();
  await expect(page).toHaveURL('/');

  // 残高は他のテストと共有するので片付ける
  await deleteRecord(page, expense);
});

test('画面の操作で閉じたダイアログは履歴に残らない', async ({ page }) => {
  await openHome(page);
  await page.goto('/expenses');

  // 開いて閉じるを繰り返しても、戻る先は前の画面のまま
  for (const amount of ['100', '200']) {
    await page.getByRole('button', { name: '立替を追加' }).click();
    await page.getByLabel('金額（円）').fill(amount);
    await page.getByRole('button', { name: '閉じる' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await settled(page);
  }

  await page.goBack();
  await expect(page).toHaveURL('/');
});

test('カレンダーの追加フォームは戻るで閉じ、日付の選択は履歴を積まない', async ({ page }) => {
  await page.goto('/calendar?view=month&date=2030-03-15');
  const title = page.getByRole('button', { name: '2030年03月（年月を選ぶ）' });

  // 追加の入力は戻るで閉じ、閉じるまで出していた日表示から元の月表示に戻る
  await page.getByRole('button', { name: '予定・タスクを追加' }).click();
  await expect(page.getByLabel('タイトルを追加')).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel('タイトルを追加')).toHaveCount(0);
  await expect(title).toBeVisible();

  // 年月を選ぶと、ダイアログの履歴は選んだ月で置き換わる（戻ると開く前の月）
  await title.click();
  await page.getByRole('button', { name: '7月' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '2030年07月（年月を選ぶ）' })).toBeVisible();
  await page.goBack();
  await expect(title).toBeVisible();
});

test('グリッドで作りかけの予定も戻るで取り消せる', async ({ page }) => {
  await page.goto('/calendar?view=week&date=2031-06-04');

  // 時間軸の列を 9:00 から 10:30 までなぞってクイック入力を出す（events.spec と同じ手順）
  const column = page.locator('[data-date="2031-06-05"]').last();
  const box = await column.boundingBox();
  if (!box) throw new Error('時間軸の列が見つからない');
  const x = box.x + box.width / 2;
  const y = (minutes: number) => box.y + (minutes / 60) * (box.height / 24);
  await page.mouse.move(x, y(9 * 60 + 5));
  await page.mouse.down();
  await page.mouse.move(x, y(10 * 60 + 20), { steps: 5 });
  await page.mouse.up();
  await expect(page.getByLabel('タイトルを追加')).toBeVisible();

  // 戻るとカレンダーに残ったまま下書きが消える
  await page.goBack();
  await expect(page.getByLabel('タイトルを追加')).toHaveCount(0);
  await expect(page).toHaveURL(/date=2031-06-04/);
  await settled(page);
});
