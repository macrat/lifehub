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

test('終日のタスクは今日から始まり、開始日を消すと保存できない', async ({ page }) => {
  const title = `E2E 終日タスク ${Date.now()}`;
  await page.goto('/calendar?view=list');

  await addOnCalendar(page, 'タスク');
  await page.getByRole('button', { name: 'その他のオプション' }).click();
  await page.getByLabel('タイトル').fill(title);
  // 追加ボタンからのタスクは見ている日（今日）の終日で始まる。日時の欄は開始だけ
  await expect(page.getByLabel('終日')).toBeChecked();
  const start = page.getByLabel('開始日', { exact: true });
  await expect(start).toHaveValue(todayValue());
  await expect(page.getByLabel('終了日', { exact: true })).toHaveCount(0);

  // 開始は必須
  await start.fill('');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('開始日時を入力してください')).toBeVisible();

  await start.fill(todayValue());
  await page.getByRole('button', { name: '保存' }).click();

  // 開始が今日なら、時刻の代わりに「開始 今日」と出る
  const row = page.getByRole('button', { name: `開始 今日 ${title}` });
  await expect(row).toBeVisible();
  await row.click();
  page.once('dialog', (dialog) => dialog.accept());
  await detailAction(page, '削除');
  await expect(page.getByText(title)).toHaveCount(0);
});
