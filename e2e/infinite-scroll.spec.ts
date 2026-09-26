import { devices, expect, type Locator, type Page, test } from '@playwright/test';
import { myId } from './auth.ts';
import { addItem } from './events.ts';
import {
  addRecord,
  bottomNav,
  type Created,
  careLogHistory,
  deleteRecord,
  expenseHistory,
  isJustAboveBottomNav,
} from './history.ts';

/**
 * 予定のリストと立替・レモンの履歴は、上が古く下が新しい無限スクロール（`src/lib/ui/InfiniteScroll.tsx`）。
 * 最初に出す位置（予定は基準の日が一番上、立替・レモンは今日の記録が一番下）と、上へ戻ると古いほうを読み足すことを確かめる。
 */
test.use({ ...devices['Pixel 7'] });

test('予定のリストは基準の日を一番上に出し、上へ戻ると前の月を読み足す', async ({ page }) => {
  const stamp = Date.now();
  // 他のテストが使わない年に、前の月・基準の日・後の日の 3 件を置く
  for (const [date, title] of [
    ['2032-04-10', `E2E 前々月 ${stamp}`],
    ['2032-06-15', `E2E 当日 ${stamp}`],
    ['2032-06-20', `E2E 後日 ${stamp}`],
  ] as const) {
    await addItem(page, {
      kind: 'event',
      title,
      startsAt: `${date}T01:00:00.000Z`,
      endsAt: `${date}T02:00:00.000Z`,
    });
  }

  await page.goto('/calendar?view=list&date=2032-06-15');
  const heading = page.getByRole('heading', { name: '6/15' });
  await expect(heading).toBeVisible();
  await expect(page.getByText(`E2E 後日 ${stamp}`)).toBeVisible();
  // 基準の日の見出しが AppBar のすぐ下に来る（上には前の日が隠れている）。
  // 下が足りない間は、前後の月が読まれるたびに合わせ直してそこへ落ち着く
  const bar = await page.getByRole('banner').boundingBox();
  const barBottom = (bar?.y ?? 0) + (bar?.height ?? 0);
  // 2px 未満の差は AppBar の下端の線と端数の分
  await expect
    .poll(async () => Math.abs(((await heading.boundingBox())?.y ?? -100) - barBottom))
    .toBeLessThan(2);

  // 上へ戻ると前の月、さらに前の月と描き足され、見ていた日は押し下げられない形で上に積まれる
  await expect(async () => {
    await page.mouse.wheel(0, -2000);
    await expect(page.getByText(`E2E 前々月 ${stamp}`)).toBeVisible({ timeout: 500 });
  }).toPass();
  const april = await page.getByText(`E2E 前々月 ${stamp}`).boundingBox();
  const june = await page.getByText(`E2E 当日 ${stamp}`).boundingBox();
  expect(april?.y ?? 0).toBeLessThan(june?.y ?? 0);
});

/**
 * 立替とレモンの履歴。どちらもサーバーが 1 ページ（50 件）ずつ返すので、それより多く置いて、
 * 最初は読んでいない古い日を残す。古い日は他のテストが使わない 2000 年、今日の記録を 2 件、
 * 未来の記録は他のテストが使わない 2099 年に 1 件置く（レモンの未来の記録はタイルを動かさない）
 */
const histories = [
  {
    name: '立替の履歴は今日の記録を下部ナビのすぐ上に出して未来の物を隠し、残高は上に貼り付いて下へスクロールすると隠れる',
    path: '/expenses',
    ...expenseHistory,
    sticky: (page: Page) => page.getByText('残高', { exact: true }),
    scrollsAway: true,
  },
  {
    name: 'レモンの記録は今日の記録を下部ナビのすぐ上に出して未来の物を隠し、状況のタイルは上に貼り付いたまま',
    path: '/lemon',
    ...careLogHistory,
    sticky: (page: Page) => page.getByText('水やり', { exact: true }).first(),
    scrollsAway: false,
  },
];

for (const history of histories) {
  test(history.name, async ({ page }) => {
    const me = await myId(page);
    const stamp = Date.now();
    const oldest = `E2E 最古 ${stamp}`;
    const todayFirst = `E2E 今日 1 ${stamp}`;
    const todayLast = `E2E 今日 2 ${stamp}`;
    const future = `E2E 未来 ${stamp}`;
    const records: [Date, string][] = [
      ...Array.from({ length: 58 }, (_, i): [Date, string] => [
        new Date(Date.UTC(2000, 0, 1 + i, 3)),
        i === 0 ? oldest : `E2E ${i} ${stamp}`,
      ]),
      [new Date(Date.UTC(2099, 0, 1, 3)), future],
    ];
    const created: Created[] = [];
    try {
      created.push(
        ...(await Promise.all(records.map(([at, text]) => addRecord(page, history, me, at, text)))),
      );
      // 今日の 2 件は 1 件ずつ順に置く。立替は同じ日の中を記録した順（サーバーの記録した時刻）で並べるので、
      // 同時に送ると届いた順で並びが入れ替わる。レモンは実施日時の順なので、少しだけ時刻をずらしておく
      created.push(await addRecord(page, history, me, new Date(stamp - 2000), todayFirst));
      created.push(await addRecord(page, history, me, new Date(stamp - 1000), todayLast));

      await page.goto(history.path);
      const sticky = history.sticky(page);
      // 今日の記録はすべて見え、未来の記録はその下に隠れている
      await expect(page.getByText(todayFirst)).toBeInViewport();
      await expect(page.getByText(todayLast)).toBeInViewport();
      await expect(sticky).toBeInViewport();
      await expect(page.getByText(oldest)).toHaveCount(0);
      // 今日の最後の記録が下部ナビのすぐ上（間に別の行が入る隙間が無い）。
      // 未来の記録はその下で、下部ナビに覆われているか画面の外にある
      expect(await isJustAboveBottomNav(page, todayLast)).toBe(true);
      const nav = await bottomNav(page).boundingBox();
      const next = await page.getByText(future).boundingBox();
      expect(next?.y ?? 0).toBeGreaterThanOrEqual(nav?.y ?? 0);

      // 上へ戻ると古いほうのページを読む。読み足した分を戻すスクロールでは隠れない
      await expect(async () => {
        await page.mouse.wheel(0, -3000);
        await expect(page.getByText(oldest)).toBeInViewport({ timeout: 500 });
      }).toPass();
      await expect(sticky).toBeInViewport();
      const oldestBox = await page.getByText(oldest).boundingBox();
      const stickyBox = await sticky.boundingBox();
      expect(stickyBox?.y ?? 0).toBeLessThan(oldestBox?.y ?? 0);

      if (history.scrollsAway) {
        // 下へスクロールすると AppBar の裏へ隠れ、少し上へ戻すと出てくる
        const bottom = async (locator: Locator) => {
          const box = await locator.boundingBox();
          return (box?.y ?? 0) + (box?.height ?? 0);
        };
        const barBottom = await bottom(page.getByRole('banner'));
        await page.mouse.wheel(0, 300);
        await expect.poll(() => bottom(sticky)).toBeLessThanOrEqual(barBottom);
        await page.mouse.wheel(0, -100);
        await expect.poll(() => bottom(sticky)).toBeGreaterThan(barBottom);
      }
    } finally {
      for (const record of created) await deleteRecord(page, record);
    }
  });
}
