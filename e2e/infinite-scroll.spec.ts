import { devices, expect, type Page, test } from '@playwright/test';
import { login, myId } from './login.ts';

/**
 * 予定のリストと立替・レモンの履歴は、上が古く下が新しい無限スクロール（`src/lib/ui/InfiniteScroll.tsx`）。
 * 最初に出す位置（予定は基準の日が一番上、立替・レモンは最新が一番下）と、上へ戻ると古いほうを読み足すことを確かめる。
 */
test.use({ ...devices['Pixel 7'] });

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('予定のリストは基準の日を一番上に出し、上へ戻ると前の月を読み足す', async ({ page }) => {
  const me = await myId(page);
  const stamp = Date.now();
  // 他のテストが使わない年に、前の月・基準の日・後の日の 3 件を置く
  for (const [date, title] of [
    ['2032-04-10', `E2E 前々月 ${stamp}`],
    ['2032-06-15', `E2E 当日 ${stamp}`],
    ['2032-06-20', `E2E 後日 ${stamp}`],
  ] as const) {
    const res = await page.request.post('/api/events', {
      data: {
        kind: 'event',
        title,
        startsAt: `${date}T01:00:00.000Z`,
        endsAt: `${date}T02:00:00.000Z`,
        participantIds: [me],
      },
    });
    expect(res.ok()).toBe(true);
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
 * 最初は読んでいない古い日を残す。日付は他のテストが使わない 2099 年（レモンの未来の記録はタイルを動かさない）
 */
const histories = [
  {
    name: '立替の履歴は最新を一番下に出し、残高は上に貼り付いたまま',
    path: '/expenses',
    api: '/api/expenses',
    body: (me: string, i: number, text: string) => ({
      fromUserId: me,
      toUserId: null,
      amount: 100,
      description: text,
      spentOn: new Date(Date.UTC(2099, 0, 1 + i)).toISOString().slice(0, 10),
    }),
    sticky: (page: Page) => page.getByText('残高', { exact: true }),
  },
  {
    name: 'レモンの記録は最新を一番下に出し、状況のタイルは上に貼り付いたまま',
    path: '/lemon',
    api: '/api/lemon/logs',
    body: (_me: string, i: number, text: string) => ({
      careTypes: ['water'],
      doneAt: new Date(Date.UTC(2099, 0, 1 + i, 3)).toISOString(),
      note: text,
    }),
    sticky: (page: Page) => page.getByText('水やり', { exact: true }).first(),
  },
];

for (const history of histories) {
  test(history.name, async ({ page }) => {
    const me = await myId(page);
    const stamp = Date.now();
    const oldest = `E2E 最古 ${stamp}`;
    const newest = `E2E 最新 ${stamp}`;
    const ids: string[] = [];
    try {
      for (let i = 0; i < 60; i++) {
        const text = i === 0 ? oldest : i === 59 ? newest : `E2E ${i} ${stamp}`;
        // ID は送る側が決める（書き込みの応答は本文を返さない）
        const id = crypto.randomUUID();
        const res = await page.request.post(history.api, {
          data: { id, ...history.body(me, i, text) },
        });
        expect(res.ok()).toBe(true);
        ids.push(id);
      }

      await page.goto(history.path);
      const sticky = history.sticky(page);
      await expect(page.getByText(newest)).toBeInViewport();
      await expect(sticky).toBeInViewport();
      await expect(page.getByText(oldest)).toHaveCount(0);

      // 上へ戻ると古いほうのページを読む。上に貼り付けた物は隠れない
      await expect(async () => {
        await page.mouse.wheel(0, -3000);
        await expect(page.getByText(oldest)).toBeInViewport({ timeout: 500 });
      }).toPass();
      await expect(sticky).toBeInViewport();
      const oldestBox = await page.getByText(oldest).boundingBox();
      const stickyBox = await sticky.boundingBox();
      expect(stickyBox?.y ?? 0).toBeLessThan(oldestBox?.y ?? 0);
    } finally {
      for (const id of ids) await page.request.delete(`${history.api}/${id}`);
    }
  });
}
