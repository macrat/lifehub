import { expect, type Page, test } from '@playwright/test';
import { addDays, minutesOfDay, today } from '../shared/date.ts';
import type { DailyWeather } from '../shared/weather.ts';

/**
 * 天気は Cron が気象庁から取ってきた表を読むだけで、E2E の DB には入らない。
 * 週間天気（`/api/weather`）とカレンダーの 1 期間分（`/api/calendar` の `weather.daily`）の応答に、
 * 今日と明日の天気を差し込んで確かめる。
 * WHY NOT 時計を止める（`page.clock`）: 偽の Date では JST の暦日の計算（`@date-fns/tz`）が壊れる。
 * 18 時の切り替えはユニットテストで確かめる（`src/features/weather/__tests__/queries.test.ts`）。
 */
const TODAY = today();
const TOMORROW = addDays(TODAY, 1);
const WEEK: DailyWeather[] = [
  { date: TODAY, icon: { symbol: 'sun' }, label: '晴', tempMax: 25, tempMin: 14, pop: 10 },
  {
    date: TOMORROW,
    icon: { symbol: 'cloud', change: 'later', next: 'rain' },
    label: '曇後雨',
    tempMax: 21,
    tempMin: 16,
    pop: 70,
  },
];

test.beforeEach(async ({ page }) => {
  await page.route('**/api/weather', (route) => route.fulfill({ json: WEEK }));
  await page.route('**/api/calendar?*', async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    await route.fulfill({ response: res, json: { ...json, weather: { daily: WEEK, hourly: [] } } });
  });
});

/** 見出しのボタンの名前（"2026年09月27日（日）"）の頭 */
const dateLabel = (date: string) =>
  new RegExp(`^${date.slice(0, 4)}年${date.slice(5, 7)}月${date.slice(8, 10)}日`);

async function openWeeklyFrom(page: Page, link: ReturnType<Page['getByRole']>) {
  await link.click();
  await expect(page).toHaveURL('/weather');
  // 明日の行に天気の名前と降水確率が並ぶ
  await expect(page.getByRole('listitem').filter({ hasText: '70%' })).toContainText('曇後雨');
}

test('ホームの天気のタイルに今日か明日の天気が出て、押すと週間天気が開く', async ({ page }) => {
  await page.goto('/');
  // 18 時までは今日、それからは明日
  const [label, temps] =
    minutesOfDay(new Date()) < 18 * 60 ? ['今日', '25° / 14°'] : ['明日', '21° / 16°'];
  const tile = page.getByRole('button', { name: new RegExp(`^${label}`) });
  await expect(tile).toContainText(temps);
  await openWeeklyFrom(page, tile);
});

test('予定画面の日付の横の天気を押すと週間天気が開く（日表示・月表示）', async ({ page }) => {
  await page.goto(`/calendar?view=day&date=${TODAY}`);
  await openWeeklyFrom(page, page.getByRole('link', { name: /^週間天気（晴/ }));

  await page.goto(`/calendar?view=month&date=${TODAY}`);
  await openWeeklyFrom(page, page.getByRole('link', { name: /^週間天気（曇後雨/ }));
});

test('週表示の見出しは、天気の外を押すと日表示へ移る', async ({ page }) => {
  await page.goto(`/calendar?view=week&date=${TOMORROW}`);
  await page.getByRole('button', { name: dateLabel(TOMORROW) }).click();
  await expect(page).toHaveURL(new RegExp(`view=day.*date=${TOMORROW}|date=${TOMORROW}.*view=day`));
});
