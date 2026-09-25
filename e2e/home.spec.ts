import { expect, test } from '@playwright/test';
import { detailAction } from './detail.ts';
import { login } from './login.ts';

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('ホームからタスクとレモンの記録を追加し、タイムラインとタイルに反映される', async ({
  page,
}) => {
  const title = `E2E ホーム ${Date.now()}`;

  await page.getByRole('button', { name: '追加' }).hover();
  await page.getByRole('menuitem', { name: 'タスク' }).click();
  await page.getByLabel('タイトル').fill(title);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText(title)).toBeVisible();

  await page.getByRole('button', { name: '追加' }).hover();
  await page.getByRole('menuitem', { name: 'レモン' }).click();
  await page.getByLabel('メモ', { exact: true }).fill(`${title} の葉水`);
  await page.getByRole('button', { name: '保存' }).click();
  // タイムラインに出て、葉水のタイルの経過日数が「今日」になる
  await expect(page.getByText(`${title} の葉水`)).toBeVisible();
  await expect(page.getByRole('button', { name: /葉水\s*今日/ })).toBeVisible();

  // 左のチェックボックスで完了・未完了を切り替えられ、完了すると取り消し線が引かれる
  await page.getByRole('checkbox', { name: `${title} を完了にする` }).click();
  await expect(page.getByRole('checkbox', { name: `${title} を未完了に戻す` })).toBeChecked();
  await expect(page.getByText(title, { exact: true })).toHaveCSS(
    'text-decoration-line',
    'line-through',
  );
  await page.getByRole('checkbox', { name: `${title} を未完了に戻す` }).click();
  await expect(page.getByRole('checkbox', { name: `${title} を完了にする` })).not.toBeChecked();

  // 行を押すと、ホームのまま詳細が開く
  await page.getByText(title, { exact: true }).click();
  await expect(page.getByRole('dialog', { name: title })).toBeVisible();
  await expect(page).toHaveURL('/');
});

test('メモを書いて、詳細から直して消せる', async ({ page }) => {
  const body = `E2E メモ ${Date.now()}`;

  // 右下の追加ボタンから書く
  await page.getByRole('button', { name: '追加' }).hover();
  await page.getByRole('menuitem', { name: 'メモ' }).click();
  await page.getByRole('textbox', { name: 'メモ', exact: true }).fill(body);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText(body)).toBeVisible();

  await page.getByRole('button', { name: '追加' }).hover();
  await page.getByRole('menuitem', { name: 'メモ' }).click();
  await page.getByRole('textbox', { name: 'メモ', exact: true }).fill(`${body} その2`);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText(`${body} その2`)).toBeVisible();

  // 詳細を開いて直す
  await page.getByText(body, { exact: true }).click();
  await page.getByRole('button', { name: '編集' }).click();
  await page.getByRole('textbox', { name: 'メモ', exact: true }).fill(`${body} 直した`);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText(`${body} 直した`)).toBeVisible();

  // 消す
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByText(`${body} 直した`).click();
  await detailAction(page, '削除');
  await expect(page.getByText(`${body} 直した`)).toHaveCount(0);

  // キーワードで絞り込むと、残ったメモだけが出る
  await page.getByLabel('記録を検索').fill(body);
  await expect(page.getByText(`${body} その2`)).toBeVisible();
  await expect(page.getByRole('button', { name: /E2E ホーム/ })).toHaveCount(0);
});

test('残高のタイルを押すと立替の入力が開く', async ({ page }) => {
  await page.getByRole('button', { name: /立替残高/ }).click();
  await expect(page.getByLabel('金額（円）')).toBeVisible();
  await expect(page).toHaveURL('/');
});

test('共有の立替で残高が出て、相手からの支払いを記録すると精算済みになる', async ({ page }) => {
  const description = `E2E 食材 ${Date.now()}`;
  await page.goto('/expenses');
  await page.getByRole('button', { name: '立替を追加' }).click();
  await page.getByLabel('金額（円）').fill('1000');
  await page.getByLabel('内容', { exact: true }).fill(description);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText(description)).toBeVisible();
  // 折半なので相手が 500 円払うと精算
  await expect(page.getByText(/相手 が E2E に支払うと精算/)).toBeVisible();

  // 精算は「相手（From）が E2E（To）に払った」立替として記録する
  await page.getByRole('button', { name: '立替を追加' }).click();
  await page.getByLabel('金額（円）').fill('500');
  await page.getByLabel('内容', { exact: true }).fill('精算');
  await page.getByLabel('From').click();
  await page.getByRole('option', { name: '相手' }).click();
  await page.getByLabel('To').click();
  await page.getByRole('option', { name: 'E2E' }).click();
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('精算済み')).toBeVisible();
});
