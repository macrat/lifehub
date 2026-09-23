import { devices, expect, type Page, test } from '@playwright/test';
import { login } from './login.ts';

/**
 * 予定のリストと立替の履歴は、上が古く下が新しい無限スクロール（`src/lib/ui/InfiniteScroll.tsx`）。
 * 最初に出す位置（予定は基準の日が一番上、立替は最新が一番下）と、上へ戻ると古いほうが描き足されることを確かめる。
 */
test.use({ ...devices['Pixel 7'] });

/** AppBar の高さ（`APP_BAR_HEIGHT`。src/lib/ui/AppShell.tsx はブラウザ向けなのでここでは読めない） */
const APP_BAR_HEIGHT = 48;

test.beforeEach(async ({ page }) => {
  await login(page);
});

async function myId(page: Page): Promise<string> {
  const users: { id: string; name: string }[] = await (await page.request.get('/api/users')).json();
  const me = users.find((u) => u.name === 'E2E');
  if (!me) throw new Error('E2E ユーザーが見つからない');
  return me.id;
}

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
  // 基準の日の見出しが AppBar のすぐ下に来ている（上には前の日が隠れている）
  const box = await heading.boundingBox();
  expect(Math.round(box?.y ?? -1)).toBe(APP_BAR_HEIGHT);

  // 上へ戻ると前の月、さらに前の月と描き足され、見ていた日は押し下げられない形で上に積まれる
  await expect(async () => {
    await page.mouse.wheel(0, -2000);
    await expect(page.getByText(`E2E 前々月 ${stamp}`)).toBeVisible({ timeout: 500 });
  }).toPass();
  const april = await page.getByText(`E2E 前々月 ${stamp}`).boundingBox();
  const june = await page.getByText(`E2E 当日 ${stamp}`).boundingBox();
  expect(april?.y ?? 0).toBeLessThan(june?.y ?? 0);
});

test('立替の履歴は最新を一番下に出し、残高は上に貼り付いたまま', async ({ page }) => {
  const me = await myId(page);
  const stamp = Date.now();
  const oldest = `E2E 最古 ${stamp}`;
  const newest = `E2E 最新 ${stamp}`;
  const ids: string[] = [];
  try {
    // 古い日から新しい日まで 1 日 1 件。描き足す単位（30 日）より多くして、上に描いていない日を残す
    for (let i = 0; i < 40; i++) {
      const res = await page.request.post('/api/expenses', {
        data: {
          fromUserId: me,
          toUserId: null,
          amount: 100,
          description: i === 0 ? oldest : i === 39 ? newest : `E2E ${i} ${stamp}`,
          spentOn: new Date(Date.UTC(2099, 0, 1 + i)).toISOString().slice(0, 10),
        },
      });
      expect(res.ok()).toBe(true);
      ids.push((await res.json()).id);
    }

    await page.goto('/expenses');
    const balance = page.getByText('残高', { exact: true });
    await expect(page.getByText(newest)).toBeInViewport();
    await expect(balance).toBeInViewport();
    await expect(page.getByText(oldest)).toHaveCount(0);

    // 上へ戻ると古い日が描き足される。残高は AppBar の下に貼り付いたまま
    await expect(async () => {
      await page.mouse.wheel(0, -3000);
      await expect(page.getByText(oldest)).toBeInViewport({ timeout: 500 });
    }).toPass();
    await expect(balance).toBeInViewport();
    const oldestBox = await page.getByText(oldest).boundingBox();
    const balanceBox = await balance.boundingBox();
    expect(balanceBox?.y ?? 0).toBeLessThan(oldestBox?.y ?? 0);
  } finally {
    for (const id of ids) await page.request.delete(`/api/expenses/${id}`);
  }
});
