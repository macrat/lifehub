import { devices, expect, type Page, test } from '@playwright/test';
import { E2E_USER } from './global-setup.ts';

/** スマホ（指で触る画面）でのカレンダー操作。PC との違いはここだけで確かめる */
test.use({ ...devices['Pixel 7'] });

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill(E2E_USER.email);
  await page.getByLabel('パスワード').fill(E2E_USER.password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page).toHaveURL('/');
});

/**
 * 指でのなぞり（タッチ）。Playwright の touchscreen はタップだけなので、CDP で touchstart〜touchend を送る。
 * hold はなぞり始めるまで押さえている時間（ミリ秒。月表示の長押しに使う）。
 */
async function touchDrag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  { hold = 0 } = {},
) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  if (hold > 0) await page.waitForTimeout(hold);
  const steps = 5;
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        {
          x: from.x + ((to.x - from.x) * i) / steps,
          y: from.y + ((to.y - from.y) * i) / steps,
        },
      ],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
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
  await page.getByRole('button', { name: '削除' }).click();
  await expect(page.getByRole('button', { name: title })).toHaveCount(0);
});

test('月表示はタップで日表示、長押しで終日の予定を作れる', async ({ page }) => {
  const title = `E2E 長押し ${Date.now()}`;
  await page.goto('/calendar?view=month&date=2031-06-15');

  const cell = (date: string) => page.locator(`[data-date="${date}"]`);
  const center = async (date: string) => {
    const box = await cell(date).boundingBox();
    if (!box) throw new Error('日のセルが見つからない');
    return { x: box.x + box.width / 2, y: box.y + box.height - 6 };
  };

  // 長押しからそのまま隣の日までなぞって、複数日の終日の予定にする
  await touchDrag(page, await center('2031-06-18'), await center('2031-06-19'), { hold: 400 });
  await expect(page.getByText('6/18(水)〜6/19(木) 終日')).toBeVisible();
  // 月の帯は端をつままない（行が低く、丸が日付や項目に重なるため）
  await expect(page.locator('[data-handle]')).toHaveCount(0);
  await page.getByLabel('タイトルを追加').fill(title);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByLabel('タイトルを追加')).toHaveCount(0);

  // 軽いタップは今までどおり日表示へ
  const tap = await center('2031-06-18');
  await page.touchscreen.tap(tap.x, tap.y);
  await expect(page).toHaveURL(/view=day&date=2031-06-18/);
  await expect(page.getByRole('button', { name: title })).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: title }).click();
  await page.getByRole('button', { name: '削除' }).click();
  await expect(page.getByRole('button', { name: title })).toHaveCount(0);
});

test('クイック入力のシートは上へスワイプで詳細入力、下へスワイプで取り消し', async ({ page }) => {
  const title = `E2E スワイプ ${Date.now()}`;
  await page.goto('/calendar?view=day&date=2031-06-05');

  const column = page.locator('[data-date="2031-06-05"]').last();
  const box = await column.boundingBox();
  if (!box) throw new Error('時間軸の列が見つからない');
  const tapColumn = async (minutes: number) => {
    await page.touchscreen.tap(box.x + box.width / 2, box.y + (minutes / 60) * (box.height / 24));
  };
  /** シートの真ん中から縦になぞる */
  const swipeSheet = async (dy: number) => {
    const sheet = await page.locator('.MuiDrawer-root .MuiPaper-root').boundingBox();
    if (!sheet) throw new Error('シートが見つからない');
    const from = { x: sheet.x + sheet.width / 2, y: sheet.y + 24 };
    await touchDrag(page, from, { x: from.x, y: from.y + dy });
  };

  // 下へスワイプすると下書きごと消える
  await tapColumn(9 * 60 + 10);
  await expect(page.getByText('6/5(木) 09:00〜10:00')).toBeVisible();
  await swipeSheet(120);
  await expect(page.getByLabel('タイトルを追加')).toHaveCount(0);
  await expect(page.locator('[data-draft]')).toHaveCount(0);

  // 上へスワイプすると入力済みの内容ごと全項目のフォームへ
  await tapColumn(9 * 60 + 10);
  await page.getByLabel('タイトルを追加').fill(title);
  await swipeSheet(-120);
  await expect(page.getByLabel('タイトル')).toHaveValue(title);
  await expect(page.getByLabel('開始')).toHaveValue('2031-06-05T09:00');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByRole('button', { name: title })).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: title }).click();
  await page.getByRole('button', { name: '削除' }).click();
  await expect(page.getByRole('button', { name: title })).toHaveCount(0);
});
