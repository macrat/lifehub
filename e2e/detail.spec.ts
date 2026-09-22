import { devices, expect, type Locator, type Page, test } from '@playwright/test';
import { detailAction } from './detail.ts';
import { login } from './login.ts';
import { touchDrag } from './touch.ts';

/** 記録をタップして開く詳細は予定・立替・レモンで同じ形なので、代表してレモンで一通りなぞる */
test.use({ ...devices['Pixel 7'] });

test.beforeEach(async ({ page }) => {
  await login(page);
});

/** その行を長押しする（動かさずに押さえたまま待って離す） */
async function longPress(page: Page, target: Locator) {
  const box = await target.boundingBox();
  if (!box) throw new Error('押す所が見つからない');
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await touchDrag(page, at, at, { hold: 400 });
}

test('記録をタップすると読むだけのシートが出て、鉛筆で広がって編集できる', async ({ page }) => {
  const note = `E2E 詳細 ${Date.now()}`;
  await page.goto('/lemon');

  await page.getByRole('button', { name: 'レモンの記録を追加' }).click();
  await page.getByLabel('メモ', { exact: true }).fill(note);
  await page.getByRole('button', { name: '保存' }).click();
  const row = page.getByRole('button', { name: new RegExp(note) });
  await expect(row).toBeVisible();

  // タップすると読むだけのシート。入力欄は無く、鉛筆と三点リーダーだけが出る
  const sheet = page.locator('[data-sheet]');
  const settled = async () => {
    await expect.poll(() => sheet.evaluate((el) => el.getAnimations().length)).toBe(0);
    const box = await sheet.boundingBox();
    if (!box) throw new Error('シートが見つからない');
    return box;
  };
  await row.click();
  const viewing = await settled();
  await expect(page.getByLabel('メモ', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'その他の操作' })).toBeVisible();

  // 鉛筆を押すと、同じシートの中が入力欄に変わって下端はそのままに上へ広がる
  await page.getByRole('button', { name: '編集' }).click();
  await expect(page.getByLabel('メモ', { exact: true })).toHaveValue(note);
  const editing = await settled();
  expect(editing.height).toBeGreaterThan(viewing.height);
  expect(Math.round(editing.y + editing.height)).toBe(Math.round(viewing.y + viewing.height));

  // 上へのスワイプでも同じところへ行ける。なぞり始めるのはつまむ帯に限らず、本文の上からでもよい
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await row.click();
  await settled();
  const x = (page.viewportSize()?.width ?? 0) / 2;
  // 一覧の行にも同じ本文が出ているので、シートの中の本文に絞る
  const body = await sheet.getByText(note, { exact: true }).boundingBox();
  if (!body) throw new Error('本文が見つからない');
  await touchDrag(page, { x, y: body.y + 4 }, { x, y: body.y - 96 });
  await expect(page.getByLabel('メモ', { exact: true })).toHaveValue(note);
  expect((await settled()).height).toBe(editing.height);

  // 入力欄の上から下へなぞっても閉じられる（タップは今までどおり入力欄に届く）
  const memo = await page.getByLabel('メモ', { exact: true }).boundingBox();
  if (!memo) throw new Error('メモ欄が見つからない');
  await page.getByLabel('メモ', { exact: true }).click();
  await expect(page.getByLabel('メモ', { exact: true })).toBeFocused();
  await touchDrag(page, { x, y: memo.y + 8 }, { x, y: memo.y + 208 });
  await expect(sheet).toHaveCount(0);
  await row.click();
  await settled();
  await page.getByRole('button', { name: '編集' }).click();
  await expect(page.getByLabel('メモ', { exact: true })).toHaveValue(note);

  // 直して保存すると一覧に反映される
  await page.getByLabel('メモ', { exact: true }).fill(`${note}（直した）`);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByText(`${note}（直した）`)).toBeVisible();

  // 削除は三点リーダーの中
  page.once('dialog', (dialog) => dialog.accept());
  await row.click();
  await detailAction(page, '削除');
  await expect(page.getByText(`${note}（直した）`)).toHaveCount(0);
});

test('記録の行は長押しすると編集で開く（立替・レモンとも同じ）', async ({ page }) => {
  const note = `E2E 行の長押し ${Date.now()}`;
  const sheet = page.locator('[data-sheet]');

  // レモン: 記録を 1 件作り、その行を長押しする
  await page.goto('/lemon');
  await page.getByRole('button', { name: 'レモンの記録を追加' }).click();
  await page.getByLabel('メモ', { exact: true }).fill(note);
  await page.getByRole('button', { name: '保存' }).click();
  const row = page.getByRole('button', { name: new RegExp(note) });
  await expect(row).toBeVisible();

  // 読むだけの段を飛ばして入力欄が出る（鉛筆はもう無い）
  await longPress(page, row);
  await expect(page.getByLabel('メモ', { exact: true })).toHaveValue(note);
  await expect(page.getByRole('button', { name: '編集' })).toHaveCount(0);

  // そのまま直して保存できる
  await page.getByLabel('メモ', { exact: true }).fill(`${note}（長押しで直した）`);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByText(`${note}（長押しで直した）`)).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: new RegExp(note) }).click();
  await detailAction(page, '削除');
  await expect(page.getByText(`${note}（長押しで直した）`)).toHaveCount(0);

  // 立替: 同じく行の長押しで金額から直せる
  await page.goto('/expenses');
  await page.getByRole('button', { name: '立替を追加' }).click();
  await page.getByLabel('金額（円）').fill('1200');
  await page.getByLabel('内容', { exact: true }).fill(note);
  await page.getByRole('button', { name: '保存' }).click();
  const expenseRow = page.getByRole('button', { name: new RegExp(note) });
  await expect(expenseRow).toBeVisible();

  await longPress(page, expenseRow);
  await expect(page.getByLabel('金額（円）')).toHaveValue('1200');
  await page.getByLabel('金額（円）').fill('1500');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByText(`￥1,500 ${note}`)).toBeVisible();

  // 残高はテスト間で共有の DB から計算されるので、作った立替は消しておく
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: new RegExp(note) }).click();
  await detailAction(page, '削除');
  await expect(page.getByText(`￥1,500 ${note}`)).toHaveCount(0);
});
