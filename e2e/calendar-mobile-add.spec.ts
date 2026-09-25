import { expect, type Page, test } from '@playwright/test';
import { setupMobileCalendar } from './calendar-mobile.ts';
import { detailAction } from './detail.ts';
import { stall } from './network.ts';
import { changeView } from './view.ts';

/** スマホの追加ボタンからの予定の入力: 閉じるまでの日表示と、閉じた後の戻り先 */
setupMobileCalendar();

/** AppBar の表示の切替に出ている今の表示（入力のシートが前に出ていても読める） */
const shownView = (page: Page) => page.getByRole('button', { name: '表示の切替' });

/**
 * 追加ボタンを開く。PC のテスト（events.spec.ts）と同じくホバーで開く: SpeedDial はホバーでも開くので、
 * click だとホバーで開いた直後の click で閉じてしまうことがある
 */
const openAddMenu = (page: Page) => page.getByRole('button', { name: '追加', exact: true }).hover();

test('月表示の追加ボタンは閉じるまで日表示を出し、閉じたら月表示に戻る', async ({ page }) => {
  const title = `E2E 月表示から ${Date.now()}`;
  await page.goto('/calendar?view=month&date=2031-06-15');
  await expect(shownView(page)).toHaveText('月');

  // 取り消し: 閉じると月表示に戻る
  await openAddMenu(page);
  await page.getByRole('menuitem', { name: '予定' }).click();
  // 予定には必ずタイトルを入れるので、追加ボタンからはそのまま打てる
  await expect(page.getByLabel('タイトルを追加')).toBeFocused();
  await expect(shownView(page)).toHaveText('日');
  await page.getByRole('button', { name: '閉じる' }).click();
  await expect(shownView(page)).toHaveText('月');

  // 保存: 返事を待たずに月表示へ戻り、下書きの枠は残らない
  await openAddMenu(page);
  await page.getByRole('menuitem', { name: '予定' }).click();
  await page.getByLabel('タイトルを追加').fill(title);
  // 保存（/api/events）とその後の取り直し（/api/calendar）の両方を遅らせる
  await stall(page, '**/api/{events,calendar}**', 1500);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.locator('[data-sheet]')).toHaveCount(0, { timeout: 1000 });
  await expect(page.locator('[data-draft]')).toHaveCount(0);
  await expect(shownView(page)).toHaveText('月');
  await expect(page.getByRole('button', { name: title })).toHaveCount(1);
  await expect(page).toHaveURL(/view=month&date=2031-06-15/);

  // 後片付けは遅らせずに送り、届くまで待つ（画面からは先に消えるので、待たないとテストが先に終わる）
  await page.unroute('**/api/{events,calendar}**');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: title }).click();
  const deleted = page.waitForResponse((r) => r.request().method() === 'DELETE');
  await detailAction(page, '削除');
  await deleted;
  await expect(page.getByRole('button', { name: title })).toHaveCount(0);
});

test('週表示の追加ボタンは週表示のまま下書きを置く', async ({ page }) => {
  await page.goto('/calendar?view=week&date=2031-06-18');
  await openAddMenu(page);
  await page.getByRole('menuitem', { name: '予定' }).click();
  await expect(page.getByLabel('タイトルを追加')).toBeVisible();
  await expect(shownView(page)).toHaveText('週');
  await expect(page.locator('[data-draft]')).toBeVisible();
  await page.getByRole('button', { name: '閉じる' }).click();
  await expect(shownView(page)).toHaveText('週');
});

test('タブを行き来しても最後に開いた表示で開く', async ({ page }) => {
  await page.goto('/calendar');
  await changeView(page, '週');
  await page.getByRole('link', { name: '立替' }).click();
  await expect(page).toHaveURL('/expenses');
  await page.getByRole('link', { name: '予定' }).click();
  await expect(shownView(page)).toHaveText('週');

  // 再読み込みしても同じ
  await page.reload();
  await expect(shownView(page)).toHaveText('週');
});

test('カレンダーで「予定」を押すと一段広い表示へ移り、見ていた日はそのまま', async ({ page }) => {
  const tab = page.getByRole('link', { name: '予定' });
  await page.goto('/calendar?view=day&date=2031-06-18');
  await tab.click();
  await expect(shownView(page)).toHaveText('週');
  await expect(page).toHaveURL(/view=week&date=2031-06-18/);
  await tab.click();
  await expect(shownView(page)).toHaveText('月');
  await expect(page).toHaveURL(/view=month&date=2031-06-18/);

  await page.goto('/calendar?view=list&date=2031-06-18');
  await tab.click();
  await expect(shownView(page)).toHaveText('月');
  await expect(page).toHaveURL(/view=month&date=2031-06-18/);
});

test('ホームの追加ボタンから始めた予定の入力は、閉じるとホームに戻る', async ({ page }) => {
  const title = `E2E ホームから ${Date.now()}`;
  const openFromHome = async () => {
    await page.goto('/');
    await openAddMenu(page);
    await page.getByRole('menuitem', { name: '予定' }).click();
    await expect(page.getByLabel('タイトルを追加')).toBeVisible();
    await expect(page).toHaveURL(/\/calendar/);
  };

  // 取り消し
  await openFromHome();
  await page.getByRole('button', { name: '閉じる' }).click();
  await expect(page).toHaveURL('/');

  // 戻る操作
  await openFromHome();
  await page.goBack();
  await expect(page).toHaveURL('/');

  // 入力中に日付や表示を切り替えて履歴を積んでいても、閉じればホームへ戻る
  // （全項目の段のシートが AppBar に重なるので、AppBar のボタンは直接押す）
  await openFromHome();
  await page.getByRole('button', { name: '今日' }).dispatchEvent('click');
  await page.getByRole('button', { name: '表示の切替' }).dispatchEvent('click');
  await page.getByRole('menuitem', { name: '週', exact: true }).click();
  await expect(page).toHaveURL(/view=week/);
  await expect(page.getByLabel('タイトルを追加')).toBeVisible();
  await page.getByRole('button', { name: '閉じる' }).click();
  await expect(page).toHaveURL('/');

  // 保存
  await openFromHome();
  await page.getByLabel('タイトルを追加').fill(title);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByText(title)).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByText(title).click();
  const deleted = page.waitForResponse((r) => r.request().method() === 'DELETE');
  await detailAction(page, '削除');
  await deleted;
  await expect(page.getByText(title)).toHaveCount(0);
});
