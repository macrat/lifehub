import { devices, expect, type Locator, type Page, test } from '@playwright/test';
import { detailAction } from './detail.ts';
import { login } from './login.ts';
import { stall } from './network.ts';
import { centerOf, LONG_PRESS_HOLD_MS, settledBox, touchDrag, touchPinch } from './touch.ts';
import { changeView, recordViewTransitions } from './view.ts';

/** スマホ（指で触る画面）でのカレンダー操作。PC との違いはここだけで確かめる */
test.use({ ...devices['Pixel 7'] });

test.beforeEach(async ({ page }) => {
  // 表示の切り替えを待つのに使う（`view.ts`）。仕込むのは最初の遷移より前
  await recordViewTransitions(page);
  await login(page);
});

/** 表示中の面（縦にスクロールする部分）。前後の面にも同じ印があるので、受け持つ日で絞る */
function scroller(page: Page, date: string) {
  return page.locator('[data-sync-scroll]').filter({ has: page.locator(`[data-date="${date}"]`) });
}

/** その面の中身の高さ（下に足した余白を含む） */
const scrollHeightOf = (pane: Locator) => () => pane.evaluate((el) => el.scrollHeight);

/**
 * 日のセルの中の 1 点。left は最初の日の左半分（開始をつまむ）、right は最後の日の右半分（終了）、
 * middle はそれ以外（帯ごと動かす・空いている所から選ぶ）。
 */
async function dayPoint(page: Page, date: string, at: 'left' | 'middle' | 'right' = 'middle') {
  const box = await settledBox(page.locator(`[data-date="${date}"]`).first());
  const ratio = at === 'left' ? 0.25 : at === 'right' ? 0.75 : 0.5;
  return { x: box.x + box.width * ratio, y: box.y + box.height / 2 };
}

/**
 * 時間軸の列の中の、その日の `minutes` 分の所（終日欄にも同じ `data-date` があるので列は最後のもの）。
 * 位置は指すたびに測り直す。グリッドはシートの開閉で動くので、最初に測った縦位置は当てにならない。
 */
async function timePoint(page: Page, date: string, minutes: number) {
  const box = await settledBox(page.locator(`[data-date="${date}"]`).last());
  return { x: box.x + box.width / 2, y: box.y + (minutes / 60) * (box.height / 24) };
}

/**
 * 日のセルを from → to へなぞる（`at` は押し始めの所）。
 * hold は押さえている時間で、空いている所から選ぶときだけ長押しが要る
 * （出ている枠に掛かる所は押した時点から動く）。
 */
async function dragDays(
  page: Page,
  from: string,
  to: string,
  at: 'left' | 'middle' | 'right' = 'middle',
  hold = 0,
) {
  await touchDrag(page, await dayPoint(page, from, at), await dayPoint(page, to), { hold });
}

/** 空いている所から長押しでなぞって下書きを作る */
async function selectDays(page: Page, from: string, to: string) {
  await dragDays(page, from, to, 'middle', LONG_PRESS_HOLD_MS);
}

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
  await page.goto('/calendar?view=day&date=2031-06-12');

  const at = (minutes: number) => timePoint(page, '2031-06-12', minutes);
  // 10:00〜11:00 の予定を 1 件作る
  const first = await at(10 * 60 + 10);
  await page.touchscreen.tap(first.x, first.y);
  await page.getByLabel('タイトルを追加').fill(title);
  await page.getByRole('button', { name: '保存' }).click();
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

  page.once('dialog', (dialog) => dialog.accept());
  await block.click();
  await expect(page.getByText('6/12(木) 14:00〜15:00')).toBeVisible();
  await detailAction(page, '削除');
  await expect(block).toHaveCount(0);
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

/** AppBar の表示の切替に出ている今の表示（入力のシートが前に出ていても読める） */
const shownView = (page: Page) => page.getByRole('button', { name: '表示の切替' });

test('月表示の追加ボタンは閉じるまで日表示を出し、閉じたら月表示に戻る', async ({ page }) => {
  const title = `E2E 追加ボタン ${Date.now()}`;
  await page.goto('/calendar?view=month&date=2031-06-15');
  await expect(shownView(page)).toHaveText('月');

  // 取り消し: 閉じると月表示に戻る
  await page.getByRole('button', { name: '追加' }).click();
  await page.getByRole('menuitem', { name: '予定' }).click();
  await expect(page.getByLabel('タイトルを追加')).toBeVisible();
  await expect(shownView(page)).toHaveText('日');
  await page.getByRole('button', { name: '閉じる' }).click();
  await expect(shownView(page)).toHaveText('月');

  // 保存: 返事を待たずに月表示へ戻り、下書きの枠は残らない
  await page.getByRole('button', { name: '追加' }).click();
  await page.getByRole('menuitem', { name: '予定' }).click();
  await page.getByLabel('タイトルを追加').fill(title);
  await stall(page, '**/api/events**', 1500);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.locator('[data-sheet]')).toHaveCount(0, { timeout: 1000 });
  await expect(page.locator('[data-draft]')).toHaveCount(0);
  await expect(shownView(page)).toHaveText('月');
  await expect(page.getByRole('button', { name: title })).toHaveCount(1);
  await expect(page).toHaveURL(/view=month&date=2031-06-15/);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: title }).click();
  await detailAction(page, '削除');
  await expect(page.getByRole('button', { name: title })).toHaveCount(0);
});

test('週表示の追加ボタンは週表示のまま下書きを置く', async ({ page }) => {
  await page.goto('/calendar?view=week&date=2031-06-18');
  await page.getByRole('button', { name: '追加' }).click();
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
