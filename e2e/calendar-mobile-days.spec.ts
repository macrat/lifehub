import { expect, test } from '@playwright/test';
import { dayPoint, dragDays, selectDays, setupMobileCalendar } from './calendar-mobile.ts';
import { detailAction } from './detail.ts';
import { centerOf, LONG_PRESS_HOLD_MS, touchDrag } from './touch.ts';
import { changeView } from './view.ts';

/** スマホの日の並び（月表示と終日欄）: タップ・長押しで選ぶ・帯をつまんで直す */
setupMobileCalendar();

test('月表示はタップで日表示、長押しで終日の予定を作れる', async ({ page }) => {
  const title = `E2E 長押し ${Date.now()}`;
  await page.goto('/calendar?view=month&date=2031-06-15');

  // 長押しからそのまま隣の日までなぞって、複数日の終日の予定にする
  await selectDays(page, '2031-06-18', '2031-06-19');
  await expect(page.getByText('6/18(水)〜6/19(木) 終日')).toBeVisible();
  // 終日の帯は月・週・日のどこでもつまむ丸を出さない（直すのはセルの長押しから）
  await expect(page.locator('[data-handle]')).toHaveCount(0);
  await page.getByLabel('タイトルを追加').fill(title);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByLabel('タイトルを追加')).toHaveCount(0);

  // 項目に掛かっていない所の軽いタップは日表示へ
  const tap = await dayPoint(page, '2031-06-18');
  await page.touchscreen.tap(tap.x, tap.y);
  await expect(page).toHaveURL(/view=day&date=2031-06-18/);
  await expect(page.getByRole('button', { name: title })).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: title }).click();
  await detailAction(page, '削除');
  await expect(page.getByRole('button', { name: title })).toHaveCount(0);
});

test('月表示は項目のタップで詳細、項目の無い所のタップで日表示', async ({ page }) => {
  const title = `E2E 月のタップ ${Date.now()}`;
  await page.goto('/calendar?view=month&date=2031-06-15');

  // 6/11〜6/12 の終日の予定を作る（下の行はクイック入力のシートに隠れるので上の行で確かめる）
  await selectDays(page, '2031-06-11', '2031-06-12');
  await page.getByLabel('タイトルを追加').fill(title);
  await page.getByRole('button', { name: '保存' }).click();
  const bar = page.getByRole('button', { name: title });
  await expect(bar).toHaveCount(1);

  // 帯を軽くタップすると読むだけの詳細が出る（日表示へは移らない）
  const sheet = page.locator('[data-sheet]');
  const at = await centerOf(bar);
  await page.touchscreen.tap(at.x, at.y);
  await expect(sheet.getByText('6/11(水)〜6/12(木)')).toBeVisible();
  await expect(page).toHaveURL(/view=month/);

  // 項目に掛かっていない所のタップは今までどおり日表示へ
  await page.getByRole('button', { name: '閉じる' }).click();
  await expect(sheet).toHaveCount(0);
  const cell = await dayPoint(page, '2031-06-11');
  await page.touchscreen.tap(cell.x, cell.y);
  await expect(page).toHaveURL(/view=day&date=2031-06-11/);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: title }).click();
  await detailAction(page, '削除');
  await expect(page.getByRole('button', { name: title })).toHaveCount(0);
});

test('月表示でも予定を長押しでつまんで別の日へ動かせる', async ({ page }) => {
  const title = `E2E 月の長押し編集 ${Date.now()}`;
  await page.goto('/calendar?view=month&date=2031-06-15');

  // 6/11〜6/12 の終日の予定を作る（下の行はクイック入力のシートに隠れるので上の行で確かめる）
  await selectDays(page, '2031-06-11', '2031-06-12');
  await page.getByLabel('タイトルを追加').fill(title);
  await page.getByRole('button', { name: '保存' }).click();
  const bar = page.getByLabel(title);
  await expect(bar).toHaveCount(1);

  // 帯（項目）の最初の日の側を長押しして、指を離さずに 1 週間先まで動かす。
  // 入力はその予定の内容から始まる
  const box = await bar.boundingBox();
  if (!box) throw new Error('予定の帯が見つからない');
  await touchDrag(
    page,
    { x: box.x + 8, y: box.y + box.height / 2 },
    await dayPoint(page, '2031-06-18'),
    { hold: LONG_PRESS_HOLD_MS },
  );
  await expect(page.getByText('6/18(水)〜6/19(木) 終日')).toBeVisible();
  await expect(page.getByLabel('タイトルを追加')).toHaveValue(title);

  // 編集中の帯は長押しを待たずに動く（掛かっているセルをなぞるだけ）
  await dragDays(page, '2031-06-18', '2031-06-17');
  await expect(page.getByText('6/17(火)〜6/18(水) 終日')).toBeVisible();

  // 保存すると元の予定が動く（別の予定が増えたりしない）
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByLabel('タイトルを追加')).toHaveCount(0);
  await expect(page.getByLabel(title)).toHaveCount(1);

  // 項目に掛かっていない所の軽いタップは日表示へ。移した先の日に出ている
  const tap = await dayPoint(page, '2031-06-17');
  await page.touchscreen.tap(tap.x, tap.y);
  await expect(page).toHaveURL(/view=day&date=2031-06-17/);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: title }).click();
  await detailAction(page, '削除');
  await expect(page.getByRole('button', { name: title })).toHaveCount(0);
});

test('週表示の終日の帯は端を伸ばし、真ん中で日数ごと動かせる', async ({ page }) => {
  // 週は月曜始まり。6/18(水) を含む週は 6/16〜6/22
  await page.goto('/calendar?view=week&date=2031-06-18');

  // 終日欄を長押しからなぞって 6/18〜6/19 の下書きを作る
  await selectDays(page, '2031-06-18', '2031-06-19');
  await expect(page.getByText('6/18(水)〜6/19(木) 終日')).toBeVisible();
  // 週・日でも月と同じ見た目にする（つまむ丸は出さない）
  await expect(page.locator('[data-handle]')).toHaveCount(0);

  // 最後の日の右半分を押すと終了日だけが動く（出ている枠なので長押しは要らない）
  await dragDays(page, '2031-06-19', '2031-06-21', 'right');
  await expect(page.getByText('6/18(水)〜6/21(土) 終日')).toBeVisible();

  // 最初の日の左半分を押すと開始日だけが動く
  await dragDays(page, '2031-06-18', '2031-06-17', 'left');
  await expect(page.getByText('6/17(火)〜6/21(土) 終日')).toBeVisible();

  // 真ん中を押すと日数（5 日）を保ったまま動く
  await dragDays(page, '2031-06-19', '2031-06-20');
  await expect(page.getByText('6/18(水)〜6/22(日) 終日')).toBeVisible();
});

test('月表示の終日の帯もつまめる（行をまたぐ移動もできる）', async ({ page }) => {
  await page.goto('/calendar?view=month&date=2031-06-15');

  await selectDays(page, '2031-06-18', '2031-06-19');
  await expect(page.getByText('6/18(水)〜6/19(木) 終日')).toBeVisible();

  // 最初の日の左半分で開始日を前へ
  await dragDays(page, '2031-06-18', '2031-06-16', 'left');
  await expect(page.getByText('6/16(月)〜6/19(木) 終日')).toBeVisible();

  // 真ん中を下の行まで動かすと、日数を保ったまま 1 週間ぶんずれる
  await dragDays(page, '2031-06-17', '2031-06-24');
  await expect(page.getByText('6/23(月)〜6/26(木) 終日')).toBeVisible();
});

test('時間指定の下書きは月表示でも帯で出て、時間ごと別の日へ動かせる', async ({ page }) => {
  await page.goto('/calendar?view=day&date=2031-06-18');

  // 日表示の時間軸をタップして 10:00〜11:00 の下書きを作る
  const box = await page.locator('[data-date="2031-06-18"]').last().boundingBox();
  if (!box) throw new Error('時間軸の列が見つからない');
  await page.touchscreen.tap(box.x + box.width / 2, box.y + (10.2 / 24) * box.height);
  await expect(page.getByText('6/18(水) 10:00〜11:00')).toBeVisible();

  // 月表示へ切り替えると、その日 1 日ぶんの帯として出る
  await changeView(page, '月');
  const cell = await page.locator('[data-date="2031-06-18"]').boundingBox();
  const bar = await page.locator('[data-draft]').boundingBox();
  if (!cell || !bar) throw new Error('帯か日のセルが見つからない');
  expect(bar.x).toBeGreaterThanOrEqual(cell.x);
  expect(bar.x + bar.width).toBeLessThanOrEqual(cell.x + cell.width + 1);

  // 別の日へ動かすと、時間帯はそのままで日だけが変わる
  await dragDays(page, '2031-06-18', '2031-06-22');
  await expect(page.getByText('6/22(日) 10:00〜11:00')).toBeVisible();
});
