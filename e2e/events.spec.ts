import { expect, test } from '@playwright/test';
import { detailAction } from './detail.ts';
import { login } from './login.ts';
import { centerOf, settledBox } from './touch.ts';

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('繰り返し予定を作成し、この回だけ変更し、削除できる', async ({ page }) => {
  const title = `E2E 週次 ${Date.now()}`;
  await page.goto('/calendar?view=week&date=2030-01-07');

  // 作成（毎週）。予定の追加は週表示のまま下書きから始まり、PC は吹き出しから全項目のフォームへ移る
  // SpeedDial はホバーで開く（クリックだと開閉が反転する）
  await page.getByRole('button', { name: '追加' }).hover();
  await page.getByRole('menuitem', { name: '予定' }).click();
  await page.getByRole('button', { name: 'その他のオプション' }).click();
  await page.getByLabel('タイトル').fill(title);
  await page.getByLabel('開始').fill('2030-01-07T09:00');
  await page.getByLabel('終了').fill('2030-01-07T10:00');
  await page.getByLabel('繰り返し', { exact: true }).click();
  await page.getByRole('option', { name: '毎週' }).click();
  await page.getByRole('button', { name: '保存' }).click();
  // 週表示はタイムライン。予定はブロック（ボタン）として出る
  await expect(page.getByRole('button', { name: title })).toBeVisible();
  await expect(page.getByRole('button', { name: '表示の切替' })).toHaveText('週');

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
  await detailAction(page, '削除');
  await page.getByRole('button', { name: /^すべて / }).click();
  await expect(page.getByRole('button', { name: title, exact: true })).toHaveCount(0);
});

test('週表示で時間をドラッグして予定を作れる', async ({ page }) => {
  const title = `E2E ドラッグ ${Date.now()}`;
  await page.goto('/calendar?view=week&date=2031-06-04');

  // 時間軸の列（1 列 = 24 時間）の上端を基準に、9:00 の枠から 10:15〜10:30 の枠までドラッグする。
  // 同じ日付は終日欄の枠にもあるので、後ろにある時間軸の列を使う
  const column = page.locator('[data-date="2031-06-05"]').last();
  const box = await column.boundingBox();
  if (!box) throw new Error('時間軸の列が見つからない');
  const x = box.x + box.width / 2;
  const y = (minutes: number) => box.y + (minutes / 60) * (box.height / 24);
  await page.mouse.move(x, y(9 * 60 + 5));
  await page.mouse.down();
  await page.mouse.move(x, y(10 * 60 + 20), { steps: 5 });
  await page.mouse.up();

  // 選んだ時間帯でクイック入力が開く
  await expect(page.getByText('6/5(木) 09:00〜10:30')).toBeVisible();
  await page.getByLabel('タイトルを追加').fill(title);

  // 「その他のオプション」には入力済みの内容と選んだ時間帯を引き継ぐ
  await page.getByRole('button', { name: 'その他のオプション' }).click();
  await expect(page.getByLabel('タイトル')).toHaveValue(title);
  await expect(page.getByLabel('開始')).toHaveValue('2031-06-05T09:00');
  await expect(page.getByLabel('終了')).toHaveValue('2031-06-05T10:30');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByRole('button', { name: title })).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: title }).click();
  await detailAction(page, '削除');
  await expect(page.getByRole('button', { name: title })).toHaveCount(0);
});

test('週表示で吹き出しを開いたまま、枠の上下の線と枠そのものをドラッグして直せる', async ({
  page,
}) => {
  await page.goto('/calendar?view=week&date=2031-06-04');

  const column = page.locator('[data-date="2031-06-05"]').last();
  const box = await column.boundingBox();
  if (!box) throw new Error('時間軸の列が見つからない');
  const y = (minutes: number) => box.y + (minutes / 60) * (box.height / 24);
  const drag = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 5 });
    await page.mouse.up();
  };
  const draftBox = () => settledBox(page.locator('[data-draft]'));

  await drag(
    { x: box.x + box.width / 2, y: y(9 * 60 + 5) },
    { x: box.x + box.width / 2, y: y(9 * 60 + 50) },
  );
  await expect(page.getByText('6/5(木) 09:00〜10:00')).toBeVisible();
  await page.getByLabel('タイトルを追加').fill('入力途中');

  // 下の線は丸ではなく線のどこでもつまめる（左端の近くから）
  let b = await draftBox();
  await drag({ x: b.x + 6, y: b.y + b.height }, { x: b.x + 6, y: y(11 * 60 + 25) });
  await expect(page.getByText('6/5(木) 09:00〜11:30')).toBeVisible();

  // 上の線（右端の近く）で開始だけを動かす
  b = await draftBox();
  await drag({ x: b.x + b.width - 6, y: b.y }, { x: b.x + b.width - 6, y: y(8 * 60 + 5) });
  await expect(page.getByText('6/5(木) 08:00〜11:30')).toBeVisible();

  // 枠そのものをつまむと長さを保ったまま隣の日へ移る。入力途中のタイトルは残る
  const c = await centerOf(page.locator('[data-draft]'));
  await drag(c, { x: c.x + box.width, y: c.y + box.height / 24 });
  await expect(page.getByText('6/6(金) 09:00〜12:30')).toBeVisible();
  await expect(page.getByLabel('タイトルを追加')).toHaveValue('入力途中');
  await expect(page.getByLabel('タイトルを追加')).toBeFocused();

  // 吹き出しと枠の外を押すと下書きを捨て、押した所から新しく選び始めはしない
  await page.mouse.click(box.x + box.width / 2, y(20 * 60));
  await expect(page.locator('[data-draft]')).toHaveCount(0);
  await expect(page.getByLabel('タイトルを追加')).toHaveCount(0);
});

test('月表示でクリックして終日の予定をその場で作れる', async ({ page }) => {
  const title = `E2E 月 ${Date.now()}`;
  await page.goto('/calendar?view=month&date=2031-06-15');

  // 日付の数字や項目を避けて、セルの下の方を押す
  const cell = page.locator('[data-date="2031-06-18"]');
  const box = await cell.boundingBox();
  if (!box) throw new Error('日のセルが見つからない');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - 6);

  // クイック入力から保存すると、その場で月グリッドに出る
  await expect(page.getByText('6/18(水) 終日')).toBeVisible();
  await page.getByLabel('タイトルを追加').fill(title);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByRole('button', { name: title })).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: title }).click();
  await detailAction(page, '削除');
  await expect(page.getByRole('button', { name: title })).toHaveCount(0);
});
