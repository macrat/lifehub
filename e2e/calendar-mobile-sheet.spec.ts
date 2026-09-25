import { expect, type Page, test } from '@playwright/test';
import {
  scroller,
  scrollHeightOf,
  selectDays,
  setupMobileCalendar,
  timePoint,
} from './calendar-mobile.ts';
import { detailAction } from './detail.ts';
import { settledBox, touchDrag } from './touch.ts';
import { changeView } from './view.ts';

/** スマホのクイック入力のシート: 段の移動・覆った分の余白・表示を切り替えても残る下書き */
setupMobileCalendar();

test('クイック入力のシートは上下のドラッグで 3 段に止まる', async ({ page }) => {
  const title = `E2E シート ${Date.now()}`;
  await page.goto('/calendar?view=day&date=2031-06-05');

  const column = page.locator('[data-date="2031-06-05"]').last();
  const box = await column.boundingBox();
  if (!box) throw new Error('時間軸の列が見つからない');
  const tapColumn = async (minutes: number) => {
    await page.touchscreen.tap(box.x + box.width / 2, box.y + (minutes / 60) * (box.height / 24));
  };
  const sheet = page.locator('[data-sheet]');
  /** シートの画面内での上端。シートは position: fixed なので、ページのスクロールとは別に見る */
  const sheetTop = () => sheet.evaluate((el) => el.getBoundingClientRect().top);
  /** シートの上端（つまむ帯）から縦になぞる */
  const dragSheet = async (dy: number) => {
    const paper = await sheet.boundingBox();
    if (!paper) throw new Error('シートが見つからない');
    const from = { x: paper.x + paper.width / 2, y: (await sheetTop()) + 8 };
    await touchDrag(page, from, { x: from.x, y: from.y + dy });
  };
  /** 入力欄の上から縦になぞる（つまむ帯だけでなく、中身の上からでもシートは動く） */
  const dragField = async (label: string, dy: number) => {
    const box = await page.getByLabel(label).boundingBox();
    if (!box) throw new Error(`${label} が見つからない`);
    const from = { x: box.x + box.width / 2, y: box.y + 8 };
    await touchDrag(page, from, { x: from.x, y: from.y + dy });
  };
  /** 段の移動はアニメーションするので、動き終えてから測る */
  const settledAt = async (expected: 'peek' | 'full') => {
    await expect.poll(() => sheet.evaluate((el) => el.getAnimations().length)).toBe(0);
    const top = await sheetTop();
    if (expected === 'peek') expect(top).toBeGreaterThan(300);
    else expect(top).toBeLessThan(10);
  };

  // タップで下の段に出る。見えるのはタイトルと参加者だけで、残りの項目は画面の外
  await tapColumn(9 * 60 + 10);
  await expect(page.getByText('6/5(木) 09:00〜10:00')).toBeVisible();
  // まだ日時を選び直すかもしれないので、タイトルに焦点は当てない
  await expect(page.getByLabel('タイトルを追加')).not.toBeFocused();
  await page.getByLabel('タイトルを追加').fill(title);
  await settledAt('peek');
  await expect(page.getByLabel('メモ')).not.toBeInViewport();

  // 少し上へドラッグすると一番上まで行き、そこで全項目を入力できる（ダイアログは出さない）。
  // なぞり始めるのは入力欄の上でもよい（つまむ帯だけでは狭すぎる）
  await dragField('タイトルを追加', -60);
  await settledAt('full');
  await expect(page.getByLabel('メモ')).toBeInViewport();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('開始')).toHaveValue('2031-06-05T09:00');
  await page.getByLabel('終了').fill('2031-06-05T11:00');
  await page.getByLabel('メモ').fill('シートから入力');

  // 少し下へドラッグすると下の段へ戻り、直した日時が見出しとグリッドの枠に映る
  await dragField('メモ', 60);
  await settledAt('peek');
  await expect(page.getByText('6/5(木) 09:00〜11:00')).toBeVisible();
  await expect(page.getByLabel('メモ')).not.toBeInViewport();

  // 下の段からさらに下げると、下書きごと消える
  await dragSheet(120);
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('[data-draft]')).toHaveCount(0);

  // 入力した内容はシートのまま保存できる
  await tapColumn(9 * 60 + 10);
  await settledAt('peek');
  await page.getByLabel('タイトルを追加').fill(title);
  await dragSheet(-60);
  await settledAt('full');
  await page.getByLabel('メモ').fill('シートから入力');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByRole('button', { name: title })).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: title }).click();
  await expect(page.getByText('シートから入力')).toBeVisible();
  await detailAction(page, '削除');
  await expect(page.getByRole('button', { name: title })).toHaveCount(0);
});

/** シートが画面の下から覆っている高さと、その上端の画面内での位置（段へ滑り終えてから測る） */
async function sheetCover(page: Page) {
  const box = await settledBox(page.locator('[data-sheet]'));
  return { top: box.y, height: (page.viewportSize()?.height ?? 0) - box.y };
}

test('シートに隠れる時間帯も、下に余白ができてスクロールで見られる', async ({ page }) => {
  await page.goto('/calendar?view=day&date=2031-06-05');

  const pane = scroller(page, '2031-06-05');
  const scrollHeight = scrollHeightOf(pane);
  const before = await scrollHeight();

  // 夕方をタップすると枠はシートに隠れるので、見える所まで送られる
  const tap = await timePoint(page, '2031-06-05', 15 * 60 + 10);
  await page.touchscreen.tap(tap.x, tap.y);
  await expect(page.getByText('6/5(木) 15:00〜16:00')).toBeVisible();
  const sheet = await sheetCover(page);
  const draft = await settledBox(page.locator('[data-draft]'));
  expect(draft.y + draft.height).toBeLessThan(sheet.top);

  // 時間軸はシートが覆う分だけ下に伸びる（1 時間の高さは変わらない）
  await expect.poll(scrollHeight).toBeCloseTo(before + sheet.height, -1);

  // 下まで下りれば、シートに覆われていた 23 時台も上に出てくる
  await pane.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  const last = await settledBox(pane.getByText('23:00', { exact: true }));
  expect(last.y).toBeLessThan(sheet.top);

  // 下書きを捨てれば余白も消える
  await page.getByRole('button', { name: '閉じる' }).click();
  await expect.poll(scrollHeight).toBe(before);
});

test('月表示も下に余白ができ、1 日の高さは変えずに隠れた週まで下りられる', async ({ page }) => {
  await page.goto('/calendar?view=month&date=2031-06-15');

  const pane = scroller(page, '2031-06-15');
  const scrollHeight = scrollHeightOf(pane);
  const cellHeight = async () =>
    (await page.locator('[data-date="2031-06-15"]').boundingBox())?.height;
  const before = { scroll: await scrollHeight(), cell: await cellHeight() };

  // 一番下の週を長押しで選ぶと、帯はシートに隠れるので見える所まで送られる
  await selectDays(page, '2031-06-25', '2031-06-26');
  await expect(page.getByText('6/25(水)〜6/26(木) 終日')).toBeVisible();
  const sheet = await sheetCover(page);
  const bar = await settledBox(page.locator('[data-draft]'));
  expect(bar.y + bar.height).toBeLessThan(sheet.top);

  // 伸びるのは下の余白だけで、1 日のセルの高さは変わらない
  await expect.poll(scrollHeight).toBeCloseTo(before.scroll + sheet.height, -1);
  expect(await cellHeight()).toBe(before.cell);
});

test('表示を切り替えても入力中の予定はそのまま残り、その初日へ移る', async ({ page }) => {
  const title = `E2E 表示切替 ${Date.now()}`;
  // 月表示が指す日（6/1）とは別の週の日を選ぶ。移らなければ週・日には下書きが出ない
  await page.goto('/calendar?view=month&date=2031-06-01');

  await selectDays(page, '2031-06-18', '2031-06-19');
  await expect(page.getByText('6/18(水)〜6/19(木) 終日')).toBeVisible();
  await page.getByLabel('タイトルを追加').fill(title);

  await changeView(page, '週');
  await expect(page).toHaveURL(/date=2031-06-18/);
  await expect(page.getByLabel('タイトルを追加')).toHaveValue(title);
  await expect(page.getByText('6/18(水)〜6/19(木) 終日')).toBeVisible();
  // 選んだ範囲は週の終日欄にもそのまま出る
  await expect(page.locator('[data-draft]')).toBeVisible();
});
