import type { Page } from '@playwright/test';
import { apiOf } from './api.ts';
import { dayPoint, setupMobileCalendar, timePoint } from './calendar-mobile.ts';
import { addItem, deleteItem } from './events.ts';
import { carries } from './network.ts';
import { expect, test } from './test.ts';
import { centerOf, LONG_PRESS_HOLD_MS, touchDrag } from './touch.ts';

/** スマホでタスクを長押しでつまんで動かす（時間軸・日の並び）と、その入力のシート */
setupMobileCalendar();

/** タスクを 1 件置く（日時は JST の壁時計の書き方） */
function createTask(page: Page, task: { title: string; allDay: boolean; startsAt: string }) {
  return addItem(page, { kind: 'task', ...task, startsAt: `${task.startsAt}+09:00` });
}

test('時間軸のタスクは長押しでつまんで動かし、下半分のシートから保存できる', async ({ page }) => {
  const title = `E2E タスク移動 ${Date.now()}`;
  // 開始が未来なのでその日に置かれ、時間軸では開始の 10:00 に出る
  const id = await createTask(page, {
    title,
    allDay: false,
    startsAt: '2031-06-19T10:00:00',
  });
  await page.goto('/calendar?view=day&date=2031-06-19');
  const at = (minutes: number) => timePoint(page, '2031-06-19', minutes);
  const block = page.getByRole('button', { name: title });
  await expect(block).toBeVisible();

  // 長押しからそのまま 5 時間ぶん下げると、落とした所が開始になる
  await touchDrag(page, await centerOf(block), await at(15 * 60 + 15), {
    hold: LONG_PRESS_HOLD_MS,
  });
  await expect(page.getByText('開始 6/19(木) 15:00', { exact: true })).toBeVisible();
  // 下の段ではタイトルと参加者だけで、タスクの端は直せない（長さを持たない）
  await expect(page.getByLabel('タイトルを追加')).toHaveValue(title);
  await expect(page.locator('[data-handle]')).toHaveCount(0);

  // 上の段まで広げるとタスクの全項目が出る
  await page.getByRole('button', { name: 'その他のオプション' }).click();
  await expect(page.getByLabel('開始日', { exact: true })).toHaveValue('2031-06-19');
  await expect(page.getByLabel('開始時刻', { exact: true })).toHaveValue('15:00');
  await expect(page.getByLabel('終了日', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('通知')).toBeVisible();

  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByLabel('タイトルを追加')).toHaveCount(0);
  await expect(block).toHaveCount(1);
  await block.click();
  await expect(page.getByText('開始: 6/19(木) 15:00')).toBeVisible();
  await deleteItem(page, id);
});

test('終日のタスクは月表示で長押しでつまんで別の日へ動かせる', async ({ page }) => {
  const title = `E2E 終日タスク移動 ${Date.now()}`;
  // 6/20 開始
  const id = await createTask(page, { title, allDay: true, startsAt: '2031-06-20T00:00:00' });
  await page.goto('/calendar?view=month&date=2031-06-01');
  const chip = page.getByRole('button', { name: title });
  await expect(chip).toBeVisible();

  await touchDrag(page, await centerOf(chip), await dayPoint(page, '2031-06-24'), {
    hold: LONG_PRESS_HOLD_MS,
  });
  await expect(page.getByText('開始 6/24(火)', { exact: true })).toBeVisible();

  // 1 日の帯でも左右の半分で端をつまむことはなく、帯ごと動く
  await touchDrag(
    page,
    await dayPoint(page, '2031-06-24', 'left'),
    await dayPoint(page, '2031-06-26'),
  );
  await expect(page.getByText('開始 6/26(木)', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByLabel('タイトルを追加')).toHaveCount(0);
  await expect(chip).toHaveCount(1);
  await chip.click();
  await expect(page.getByText('開始: 6/26(木)')).toBeVisible();
  await deleteItem(page, id);
});

test('なぞって開いた予定の入力は上端でタスクに切り替えられ、詳細の編集でも予定に戻せる', async ({
  page,
}) => {
  const title = `E2E 予定からタスク ${Date.now()}`;
  await page.goto('/calendar?view=day&date=2031-06-26');
  const at = (minutes: number) => timePoint(page, '2031-06-26', minutes);
  const tap = await at(15 * 60 + 10);
  await page.touchscreen.tap(tap.x, tap.y);
  await expect(page.getByText('6/26(木) 15:00〜16:00')).toBeVisible();
  await expect(page.locator('[data-handle]')).toHaveCount(2);
  await page.getByLabel('タイトルを追加').fill(title);

  // タスクへ: 開始だけを引き継ぎ、枠は端の無いタスクの形になる。入力したタイトルは残る
  await page.getByRole('button', { name: 'タスク', exact: true }).click();
  await expect(page.getByText('開始 6/26(木) 15:00', { exact: true })).toBeVisible();
  await expect(page.locator('[data-handle]')).toHaveCount(0);
  await expect(page.getByLabel('タイトルを追加')).toHaveValue(title);

  // 予定へ戻すと、開始から 1 時間の予定になる
  await page.getByRole('button', { name: '予定', exact: true }).click();
  await expect(page.getByText('6/26(木) 15:00〜16:00')).toBeVisible();
  await expect(page.locator('[data-handle]')).toHaveCount(2);

  // タスクにして保存する
  await page.getByRole('button', { name: 'タスク', exact: true }).click();
  await page.getByRole('button', { name: '保存' }).click();
  const block = page.getByRole('button', { name: title });
  await expect(block).toBeVisible();
  await block.click();
  await expect(page.getByText('開始: 6/26(木) 15:00')).toBeVisible();

  // 詳細の編集でも種類を切り替えられる。予定にすると開始から 1 時間になる
  await page.getByRole('button', { name: '編集' }).click();
  await page.getByRole('button', { name: '予定', exact: true }).click();
  await expect(page.getByLabel('開始時刻', { exact: true })).toHaveValue('15:00');
  await expect(page.getByLabel('終了日', { exact: true })).toHaveValue('2031-06-26');
  await expect(page.getByLabel('終了時刻', { exact: true })).toHaveValue('16:00');
  // 保存は送信を待たずに画面へ出る（楽観的更新）ので、サーバーに届いてから読み直す
  const updated = page.waitForResponse(carries('events.update'));
  await page.getByRole('button', { name: '保存' }).click();
  await expect(block).toBeVisible();
  expect((await updated).ok()).toBe(true);

  const { items } = await apiOf(page.request).calendar.get.query({
    from: '2031-06-26',
    to: '2031-06-26',
  });
  const saved = items.find((item) => item.title === title);
  expect(saved?.kind).toBe('event');
  if (saved) await deleteItem(page, saved.id);
});
