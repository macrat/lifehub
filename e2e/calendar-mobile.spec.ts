import { devices, expect, type Page, test } from '@playwright/test';
import { detailAction } from './detail.ts';
import { E2E_USER } from './global-setup.ts';
import { touchDrag } from './touch.ts';
import { changeView, recordViewTransitions } from './view.ts';

/** スマホ（指で触る画面）でのカレンダー操作。PC との違いはここだけで確かめる */
test.use({ ...devices['Pixel 7'] });

test.beforeEach(async ({ page }) => {
  // 表示の切り替えを待つのに使う（`view.ts`）。仕込むのは最初の遷移より前
  await recordViewTransitions(page);
  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill(E2E_USER.email);
  await page.getByLabel('パスワード').fill(E2E_USER.password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page).toHaveURL('/');
});

/**
 * 日のセルの中の 1 点。left は最初の日の左半分（開始をつまむ）、right は最後の日の右半分（終了）、
 * middle はそれ以外（帯ごと動かす・空いている所から選ぶ）。
 */
async function dayPoint(page: Page, date: string, at: 'left' | 'middle' | 'right' = 'middle') {
  const box = await page.locator(`[data-date="${date}"]`).first().boundingBox();
  if (!box) throw new Error('日のセルが見つからない');
  const ratio = at === 'left' ? 0.25 : at === 'right' ? 0.75 : 0.5;
  return { x: box.x + box.width * ratio, y: box.y + box.height / 2 };
}

/** 日のセルを長押ししてから from → to へなぞる（`at` は押し始めの所） */
async function dragDays(
  page: Page,
  from: string,
  to: string,
  at: 'left' | 'middle' | 'right' = 'middle',
) {
  await touchDrag(page, await dayPoint(page, from, at), await dayPoint(page, to), { hold: 400 });
}

test('日表示でタップして選び、端をつまんで広げて予定を作れる', async ({ page }) => {
  const title = `E2E タップ ${Date.now()}`;
  await page.goto('/calendar?view=day&date=2031-06-05');

  const column = page.locator('[data-date="2031-06-05"]').last();
  const box = await column.boundingBox();
  if (!box) throw new Error('時間軸の列が見つからない');
  const x = box.x + box.width / 2;
  const y = (minutes: number) => box.y + (minutes / 60) * (box.height / 24);

  // タップした枠から 1 時間を選び、画面下のシートに出す
  await page.touchscreen.tap(x, y(15 * 60 + 10));
  await expect(page.getByText('6/5(木) 15:00〜16:00')).toBeVisible();

  // 下端の丸をつまんで 17:00 まで広げる。指の当たりは丸（8px）より広いので、
  // 丸から外れた所（左に 14px、上に 10px）から掴めることも併せて確かめる
  const handleBox = await page.locator('[data-handle="end"]').boundingBox();
  if (!handleBox) throw new Error('つまむ丸が見つからない');
  await touchDrag(
    page,
    { x: handleBox.x + handleBox.width / 2 - 14, y: handleBox.y + handleBox.height / 2 - 10 },
    { x, y: y(17 * 60 - 5) },
  );
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

  const column = page.locator('[data-date="2031-06-05"]').last();
  const box = await column.boundingBox();
  if (!box) throw new Error('時間軸の列が見つからない');
  const x = box.x + box.width / 2;
  const y = (minutes: number) => box.y + (minutes / 60) * (box.height / 24);
  /** 端の丸の中心。丸は枠の左右の内側にあるので、位置は毎回測り直す */
  const handle = async (end: 'start' | 'end') => {
    const dot = await page.locator(`[data-handle="${end}"]`).boundingBox();
    if (!dot) throw new Error('つまむ丸が見つからない');
    return { x: dot.x + dot.width / 2, y: dot.y + dot.height / 2 };
  };

  await page.touchscreen.tap(x, y(10 * 60 + 10));
  await expect(page.getByText('6/5(木) 10:00〜11:00')).toBeVisible();

  // 丸ではない所から長押しでなぞると、長さ 1 時間を保ったまま 3 時間ぶん下がる
  await touchDrag(page, { x, y: y(10 * 60 + 30) }, { x, y: y(13 * 60 + 30) }, { hold: 400 });
  await expect(page.getByText('6/5(木) 13:00〜14:00')).toBeVisible();

  // 終了の丸は開始より上へ行けず、開始の 15 分後で止まる
  await touchDrag(page, await handle('end'), { x, y: y(11 * 60) });
  await expect(page.getByText('6/5(木) 13:00〜13:15')).toBeVisible();

  // 終了の丸を戻して 1 時間にし、開始の丸は終了の 15 分前で止まることを確かめる
  await touchDrag(page, await handle('end'), { x, y: y(14 * 60) });
  await expect(page.getByText('6/5(木) 13:00〜14:00')).toBeVisible();
  await touchDrag(page, await handle('start'), { x, y: y(16 * 60) });
  await expect(page.getByText('6/5(木) 13:45〜14:00')).toBeVisible();
});

test('週表示では枠を長押しして左右に動かすと別の日へ移る', async ({ page }) => {
  const title = `E2E 日をまたぐ ${Date.now()}`;
  await page.goto('/calendar?view=week&date=2031-06-05');

  /** 時間軸の列（終日欄にも同じ data-date があるので最後のものを取る） */
  const column = async (date: string) => {
    const box = await page.locator(`[data-date="${date}"]`).last().boundingBox();
    if (!box) throw new Error('時間軸の列が見つからない');
    return box;
  };
  const thu = await column('2031-06-05');
  const y = (minutes: number) => thu.y + (minutes / 60) * (thu.height / 24);
  const center = (box: { x: number; width: number }) => box.x + box.width / 2;

  await page.touchscreen.tap(center(thu), y(10 * 60 + 10));
  await expect(page.getByText('6/5(木) 10:00〜11:00')).toBeVisible();

  // 長押しから隣の列までなぞると、時間帯はそのままで日だけが翌日に移る
  const fri = await column('2031-06-06');
  await touchDrag(
    page,
    { x: center(thu), y: y(10 * 60 + 30) },
    { x: center(fri), y: y(10 * 60 + 30) },
    { hold: 400 },
  );
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
  await dragDays(page, '2031-06-18', '2031-06-19');
  await expect(page.getByText('6/18(水)〜6/19(木) 終日')).toBeVisible();
  // 終日の帯は月・週・日のどこでもつまむ丸を出さない（直すのはセルの長押しから）
  await expect(page.locator('[data-handle]')).toHaveCount(0);
  await page.getByLabel('タイトルを追加').fill(title);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByLabel('タイトルを追加')).toHaveCount(0);

  // 軽いタップは今までどおり日表示へ
  const tap = await dayPoint(page, '2031-06-18');
  await page.touchscreen.tap(tap.x, tap.y);
  await expect(page).toHaveURL(/view=day&date=2031-06-18/);
  await expect(page.getByRole('button', { name: title })).toBeVisible();

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

test('週表示の終日の帯は長押しで端を伸ばし、真ん中で日数ごと動かせる', async ({ page }) => {
  // 週は月曜始まり。6/18(水) を含む週は 6/16〜6/22
  await page.goto('/calendar?view=week&date=2031-06-18');

  // 終日欄を長押しからなぞって 6/18〜6/19 の下書きを作る
  await dragDays(page, '2031-06-18', '2031-06-19');
  await expect(page.getByText('6/18(水)〜6/19(木) 終日')).toBeVisible();
  // 週・日でも月と同じ見た目にする（つまむ丸は出さない）
  await expect(page.locator('[data-handle]')).toHaveCount(0);

  // 最後の日の右半分を長押しすると終了日だけが動く
  await dragDays(page, '2031-06-19', '2031-06-21', 'right');
  await expect(page.getByText('6/18(水)〜6/21(土) 終日')).toBeVisible();

  // 最初の日の左半分を長押しすると開始日だけが動く
  await dragDays(page, '2031-06-18', '2031-06-17', 'left');
  await expect(page.getByText('6/17(火)〜6/21(土) 終日')).toBeVisible();

  // 真ん中を長押しすると日数（5 日）を保ったまま動く
  await dragDays(page, '2031-06-19', '2031-06-20');
  await expect(page.getByText('6/18(水)〜6/22(日) 終日')).toBeVisible();
});

test('月表示の終日の帯も長押しでつまめる（行をまたぐ移動もできる）', async ({ page }) => {
  await page.goto('/calendar?view=month&date=2031-06-15');

  await dragDays(page, '2031-06-18', '2031-06-19');
  await expect(page.getByText('6/18(水)〜6/19(木) 終日')).toBeVisible();

  // 最初の日の左半分で開始日を前へ
  await dragDays(page, '2031-06-18', '2031-06-16', 'left');
  await expect(page.getByText('6/16(月)〜6/19(木) 終日')).toBeVisible();

  // 真ん中を下の行まで動かすと、日数を保ったまま 1 週間ぶんずれる
  await dragDays(page, '2031-06-17', '2031-06-24');
  await expect(page.getByText('6/23(月)〜6/26(木) 終日')).toBeVisible();
});

test('時間指定の下書きは月表示でも帯で出て、長押しで時間ごと別の日へ動かせる', async ({ page }) => {
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

  // 長押しして別の日へ動かすと、時間帯はそのままで日だけが変わる
  await dragDays(page, '2031-06-18', '2031-06-22');
  await expect(page.getByText('6/22(日) 10:00〜11:00')).toBeVisible();
});

test('表示を切り替えても入力中の予定はそのまま残り、その初日へ移る', async ({ page }) => {
  const title = `E2E 表示切替 ${Date.now()}`;
  // 月表示が指す日（6/1）とは別の週の日を選ぶ。移らなければ週・日には下書きが出ない
  await page.goto('/calendar?view=month&date=2031-06-01');

  await dragDays(page, '2031-06-18', '2031-06-19');
  await expect(page.getByText('6/18(水)〜6/19(木) 終日')).toBeVisible();
  await page.getByLabel('タイトルを追加').fill(title);

  await changeView(page, '週');
  await expect(page).toHaveURL(/date=2031-06-18/);
  await expect(page.getByLabel('タイトルを追加')).toHaveValue(title);
  await expect(page.getByText('6/18(水)〜6/19(木) 終日')).toBeVisible();
  // 選んだ範囲は週の終日欄にもそのまま出る
  await expect(page.locator('[data-draft]')).toBeVisible();
});
