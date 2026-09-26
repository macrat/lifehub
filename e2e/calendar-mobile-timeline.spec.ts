import { expect, test } from '@playwright/test';
import { scroller, scrollHeightOf, setupMobileCalendar, timePoint } from './calendar-mobile.ts';
import { detailAction } from './detail.ts';
import { addItem, deleteItem } from './events.ts';
import { centerOf, LONG_PRESS_HOLD_MS, touchDrag, touchPinch } from './touch.ts';
import { changeView } from './view.ts';

/** スマホの週・日の時間軸: なぞって選ぶ・枠をつまんで直す・ピンチ・最初の縦位置 */
setupMobileCalendar();

test('日表示でタップして選び、端をつまんで広げて予定を作れる', async ({ page }) => {
  const title = `E2E タップ ${Date.now()}`;
  await page.goto('/calendar?view=day&date=2031-06-05');

  const at = (minutes: number) => timePoint(page, '2031-06-05', minutes);

  // 夕方をタップして 1 時間を選ぶ。枠はシートに隠れるので、グリッドは見える所まで送られる
  const tap = await at(15 * 60 + 10);
  await page.touchscreen.tap(tap.x, tap.y);
  await expect(page.getByText('6/5(木) 15:00〜16:00')).toBeVisible();

  // 下端の丸をつまんで 17:00 まで広げる。指の当たりは丸（8px）より広いので、
  // 丸から外れた所（左に 14px、上に 10px）から掴めることも併せて確かめる
  const handle = await centerOf(page.locator('[data-handle="end"]'));
  await touchDrag(page, { x: handle.x - 14, y: handle.y - 10 }, await at(17 * 60 - 5));
  await expect(page.getByText('6/5(木) 15:00〜17:00')).toBeVisible();

  await page.getByLabel('タイトルを追加').fill(title);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByRole('button', { name: title })).toBeVisible();
  await expect(page.getByLabel('タイトルを追加')).toHaveCount(0);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: title }).click();
  await detailAction(page, '削除');
  await expect(page.getByRole('button', { name: title })).toHaveCount(0);
});

test('日表示で枠をつまんで動かし、端の丸は反対の端を越えない', async ({ page }) => {
  await page.goto('/calendar?view=day&date=2031-06-05');

  const at = (minutes: number) => timePoint(page, '2031-06-05', minutes);
  /** 端の丸の中心。丸は枠の左右の内側にあるので、位置は毎回測り直す */
  const handle = (end: 'start' | 'end') => centerOf(page.locator(`[data-handle="${end}"]`));

  const tap = await at(10 * 60 + 10);
  await page.touchscreen.tap(tap.x, tap.y);
  await expect(page.getByText('6/5(木) 10:00〜11:00')).toBeVisible();

  // 丸ではない所からなぞると、長押しを待たずに長さ 1 時間を保ったまま 3 時間ぶん下がる
  await touchDrag(page, await at(10 * 60 + 30), await at(13 * 60 + 30));
  await expect(page.getByText('6/5(木) 13:00〜14:00')).toBeVisible();

  // 終了の丸は開始より上へ行けず、開始の 15 分後で止まる
  await touchDrag(page, await handle('end'), await at(11 * 60));
  await expect(page.getByText('6/5(木) 13:00〜13:15')).toBeVisible();

  // 終了の丸を戻して 1 時間にし、開始の丸は終了の 15 分前で止まることを確かめる
  await touchDrag(page, await handle('end'), await at(14 * 60));
  await expect(page.getByText('6/5(木) 13:00〜14:00')).toBeVisible();
  await touchDrag(page, await handle('start'), await at(16 * 60));
  await expect(page.getByText('6/5(木) 13:45〜14:00')).toBeVisible();
});

test('予定は長押しでつまんで編集モードに入り、そのまま動かして保存できる', async ({ page }) => {
  const title = `E2E 長押し編集 ${Date.now()}`;
  const id = await addItem(page, {
    kind: 'event',
    title,
    startsAt: '2031-06-12T10:00:00+09:00',
    endsAt: '2031-06-12T11:00:00+09:00',
  });
  await page.goto('/calendar?view=day&date=2031-06-12');

  const at = (minutes: number) => timePoint(page, '2031-06-12', minutes);
  const block = page.getByRole('button', { name: title });
  await expect(block).toBeVisible();

  // 軽いタップは今までどおり詳細を開く（編集モードには入らない）
  const tap = await centerOf(block);
  await page.touchscreen.tap(tap.x, tap.y);
  await expect(page.getByText('6/12(木) 10:00〜11:00')).toBeVisible();
  await page.getByRole('button', { name: '閉じる' }).click();
  await expect(page.locator('[data-draft]')).toHaveCount(0);

  // 長押しからそのまま指を離さずになぞると、長さを保ったまま 2 時間ぶん下がる。
  // 入力はその予定の内容から始まる（タイトルはそのまま）
  await touchDrag(page, tap, await at(12 * 60 + 30), { hold: LONG_PRESS_HOLD_MS });
  await expect(page.getByText('6/12(木) 12:00〜13:00')).toBeVisible();
  await expect(page.getByLabel('タイトルを追加')).toHaveValue(title);

  // 編集中の枠は長押しを待たずに動く
  await touchDrag(page, await centerOf(page.locator('[data-draft]')), await at(14 * 60 + 30));
  await expect(page.getByText('6/12(木) 14:00〜15:00')).toBeVisible();

  // 保存すると元の予定が動く（別の予定が増えたりしない）
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByLabel('タイトルを追加')).toHaveCount(0);
  await expect(block).toHaveCount(1);

  await block.click();
  await expect(page.getByText('6/12(木) 14:00〜15:00')).toBeVisible();
  await deleteItem(page, id);
});

test('日表示を 2 本の指でつまむと時間軸が縦に伸び縮みする', async ({ page }) => {
  await page.goto('/calendar?view=day&date=2031-06-05');

  const pane = scroller(page, '2031-06-05');
  const view = await pane.boundingBox();
  if (!view) throw new Error('時間軸が見つからない');
  const center = { x: view.x + view.width / 2, y: view.y + view.height / 2 };
  const height = async () => (await pane.locator('[data-time-grid]').boundingBox())?.height ?? 0;

  const before = await height();
  expect(before).toBeGreaterThan(0);

  // 指の間隔を 2.5 倍に拡げると、1 時間あたりの高さ（＝時間軸の高さ）も 2.5 倍になる
  await touchPinch(page, center, 120, 300);
  await expect.poll(height).toBeCloseTo(before * 2.5, -1);
  // つまんでいる間に下書きは出ない（2 本目の指が触れたら範囲選びはピンチに譲る）
  await expect(page.locator('[data-handle]')).toHaveCount(0);

  // 縮めれば元の高さに戻る
  await touchPinch(page, center, 300, 120);
  await expect.poll(height).toBeCloseTo(before, -1);
});

/**
 * 月表示から移ると、予定に合わせた縦位置で出る。位置の決め方（収まるなら真ん中、収まらなければ
 * 一番早い予定の 1 時間前）は `initialScrollTop` のユニットテストで確かめる。ここでは月表示から来たときに
 * 予定に合わせることと、数で求めた位置が CSS で描かれた時間軸と合っていることを見る。
 */
test('月表示から日表示へ移ると、予定が画面の真ん中に来る縦位置で出る', async ({ page }) => {
  const title = `E2E 縦位置 ${Date.now()}`;
  // 他のテストが使わない月の 12〜13 時に 1 件だけ置く
  await addItem(page, {
    kind: 'event',
    title,
    startsAt: '2033-09-14T12:00:00+09:00',
    endsAt: '2033-09-14T13:00:00+09:00',
  });
  await page.goto('/calendar?view=month&date=2033-09-14');
  await expect(page.getByText(title)).toBeVisible();
  await changeView(page, '日');
  // 1 時間の高さは、下に足す余白が無いので中身の高さの 1/24
  const day = await scroller(page, '2033-09-14').evaluate((el) => ({
    middle: el.scrollTop + el.clientHeight / 2,
    hour: el.scrollHeight / 24,
  }));
  expect(day.middle).toBeCloseTo(day.hour * 12.5, -1);
});

test('予定のブロックは高さが足りるときだけ時刻を添える', async ({ page }) => {
  const title = `E2E 時刻の行 ${Date.now()}`;
  await page.goto('/calendar?view=day&date=2031-06-05');

  const pane = scroller(page, '2031-06-05');
  // 最初の縦位置は 7 時（今日を含まない日）。高さは CSS が決めるので、描かれた物で確かめる
  expect(await pane.evaluate((el) => el.scrollTop)).toBeCloseTo(
    (await scrollHeightOf(pane)()) * (7 / 24),
    1,
  );

  const column = page.locator('[data-date="2031-06-05"]').last();
  const box = await column.boundingBox();
  if (!box) throw new Error('時間軸の列が見つからない');
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 24 / 2 + box.height / 2.4);
  await page.getByLabel('タイトルを追加').fill(title);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByLabel('タイトルを追加')).toHaveCount(0);

  const block = page.getByRole('button', { name: title });
  const time = block.getByText(/\d{1,2}:\d{2}〜\d{1,2}:\d{2}/);
  const blockHeight = async () => (await block.boundingBox())?.height ?? 0;
  await expect(time).toBeVisible();

  // つまんで縮めるとブロックが低くなり、時刻の行は引っ込む（判定は描かれた高さそのもの。
  // `@container`。JS は高さの数を持たない）
  const view = await pane.boundingBox();
  if (!view) throw new Error('面が見つからない');
  const center = { x: view.x + view.width / 2, y: view.y + view.height / 2 };
  await touchPinch(page, center, 300, 100);
  await expect.poll(blockHeight).toBeLessThan(34);
  await expect(time).toBeHidden();

  // 拡げ直せば戻る
  await touchPinch(page, center, 100, 300);
  await expect.poll(blockHeight).toBeGreaterThan(34);
  await expect(time).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await block.click();
  await detailAction(page, '削除');
  await expect(block).toHaveCount(0);
});

test('週表示では枠を左右に動かすと別の日へ移る', async ({ page }) => {
  const title = `E2E 日をまたぐ ${Date.now()}`;
  await page.goto('/calendar?view=week&date=2031-06-05');

  const thu = (minutes: number) => timePoint(page, '2031-06-05', minutes);
  const fri = (minutes: number) => timePoint(page, '2031-06-06', minutes);

  const tap = await thu(10 * 60 + 10);
  await page.touchscreen.tap(tap.x, tap.y);
  await expect(page.getByText('6/5(木) 10:00〜11:00')).toBeVisible();

  // 隣の列までなぞると、時間帯はそのままで日だけが翌日に移る
  await touchDrag(page, await thu(10 * 60 + 30), await fri(10 * 60 + 30));
  await expect(page.getByText('6/6(金) 10:00〜11:00')).toBeVisible();

  await page.getByLabel('タイトルを追加').fill(title);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByLabel('タイトルを追加')).toHaveCount(0);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: title }).click();
  await expect(page.getByText('6/6(金) 10:00〜11:00')).toBeVisible();
  await detailAction(page, '削除');
  await expect(page.getByRole('button', { name: title })).toHaveCount(0);
});
