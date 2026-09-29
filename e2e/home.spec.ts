import { expect, test } from '@playwright/test';
import { openHome } from './auth.ts';
import { detailAction } from './detail.ts';
import { addItem, deleteItem } from './events.ts';

test('タスクとレモンの記録がタイムラインとタイルに反映される', async ({ page }) => {
  const title = `E2E ホーム ${Date.now()}`;
  await addItem(page, { kind: 'task', title });
  await openHome(page);
  await expect(page.getByText(title)).toBeVisible();

  // 葉水のタイルから記録する
  await page.getByRole('button', { name: /^葉水/ }).click();
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
  await page.getByRole('button', { name: title, exact: true }).click();
  await expect(page.getByRole('dialog', { name: title })).toBeVisible();
  await expect(page).toHaveURL('/');
});

test('メモを書いて、詳細から直して消せる', async ({ page }) => {
  await openHome(page);
  const body = `E2E メモ ${Date.now()}`;

  // 右下の追加ボタンから、種類を選ばずにそのまま書く
  await page.getByRole('button', { name: 'メモを追加' }).click();
  await page.getByRole('textbox', { name: 'メモ', exact: true }).fill(body);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText(body)).toBeVisible();

  await page.getByRole('button', { name: 'メモを追加' }).click();
  await page.getByRole('textbox', { name: 'メモ', exact: true }).fill(`${body} その2`);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText(`${body} その2`)).toBeVisible();

  // 詳細を開いて直す
  await page.getByRole('button', { name: new RegExp(`${body}$`) }).click();
  await page.getByRole('button', { name: '編集' }).click();
  // 編集に切り替えたらそのまま打てる
  await expect(page.getByRole('textbox', { name: 'メモ', exact: true })).toBeFocused();
  await page.getByRole('textbox', { name: 'メモ', exact: true }).fill(`${body} 直した`);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText(`${body} 直した`)).toBeVisible();

  // 消す
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: `${body} 直した` }).click();
  await detailAction(page, '削除');
  await expect(page.getByText(`${body} 直した`)).toHaveCount(0);

  // キーワードで絞り込むと、残ったメモだけが出る
  await page.getByLabel('記録を検索').fill(body);
  await expect(page.getByText(`${body} その2`)).toBeVisible();
  await expect(page.getByRole('button', { name: /E2E ホーム/ })).toHaveCount(0);
});

test('場所のある予定は、タイトルの下・メモの上に地図を開く場所が出る', async ({ page }) => {
  const title = `E2E 場所 ${Date.now()}`;
  const id = await addItem(page, {
    kind: 'event',
    title,
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    location: `${title} の場所`,
    note: `${title} のメモ`,
  });
  await openHome(page);

  await expect(page.getByRole('button', { name: new RegExp(title) })).toHaveAccessibleName(
    new RegExp(`${title}.*${title} の場所.*${title} のメモ`),
  );
  // 場所はアイコンと文字の所だけが、地図でその場所を検索するリンクになる
  await expect(page.getByRole('link', { name: `${title} の場所` })).toHaveAttribute(
    'href',
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${title} の場所`)}`,
  );
  await deleteItem(page, id);
});
