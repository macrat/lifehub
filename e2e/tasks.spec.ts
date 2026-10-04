import { detailAction } from './detail.ts';
import { addOnCalendar } from './events.ts';
import { expect, test } from './test.ts';

/** 今日（JST）の日付の入力欄の値 */
const todayValue = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });

test('タスクを追加し、カレンダーのリスト表示から完了にできる', async ({ page }) => {
  const title = `E2E タスク ${Date.now()}`;
  await page.goto('/calendar?view=list');

  // 追加ボタンでタスクを選ぶと、見ている今日から始まるタスクの入力が開き、タイトルだけで保存できる
  await addOnCalendar(page, 'タスク');
  await page.getByLabel('タイトルを追加').fill(title);
  await page.getByRole('button', { name: '保存' }).click();

  // 開始が今日のタスクは今日の位置に出る
  await expect(page.getByText(title)).toBeVisible();
  // チェックボックスはサーバーの結果で制御されるので、click して結果を待つ（check は即時の状態変化を要求する）
  await page.getByRole('checkbox', { name: `${title} を完了にする` }).click();
  await expect(page.getByRole('checkbox', { name: `${title} を未完了に戻す` })).toBeChecked();

  // 詳細から削除
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: title }).click();
  await detailAction(page, '削除');
  await expect(page.getByText(title)).toHaveCount(0);
});

test('終日のタスクを追加すると、期限日だけを持つタスクとして出る', async ({ page }) => {
  const title = `E2E 終日タスク ${Date.now()}`;
  await page.goto('/calendar?view=list');

  await addOnCalendar(page, 'タスク');
  await page.getByRole('button', { name: 'その他のオプション' }).click();
  await page.getByLabel('タイトル').fill(title);
  // 追加ボタンからのタスクは見ている日の終日で始まる。開始日を消して期限日だけを入れる
  await expect(page.getByLabel('終日')).toBeChecked();
  await expect(page.getByLabel('開始日', { exact: true })).toHaveValue(todayValue());
  await page.getByLabel('開始日', { exact: true }).fill('');
  const due = page.getByLabel('期限日', { exact: true });
  await expect(due).toHaveAttribute('type', 'date');
  await due.fill(todayValue());
  await page.getByRole('button', { name: '保存' }).click();

  // 期限が今日なら、時刻の代わりに「期限 今日」と出る
  const row = page.getByRole('button', { name: `期限 今日 ${title}` });
  await expect(row).toBeVisible();
  await row.click();
  page.once('dialog', (dialog) => dialog.accept());
  await detailAction(page, '削除');
  await expect(page.getByText(title)).toHaveCount(0);
});
