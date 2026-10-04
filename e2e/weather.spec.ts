import type { Page } from '@playwright/test';
import { addDays, minutesOfDay, today } from '../shared/date.ts';
import type { HistoryPage } from '../shared/types.ts';
import type { DailyWeather, WeatherDay } from '../shared/weather.ts';
import { appBar, bottomOf } from './layout.ts';
import { rewriteJson } from './network.ts';
import { expect, test } from './test.ts';
import { captured, recordViewTransitions, settle, transitions } from './view.ts';

/**
 * 天気は Cron が気象庁から取ってきた表を読むだけで、E2E の DB には入らない。
 * 天気の画面の 1 ページ（`weather.page`）とカレンダーの 1 期間分（`calendar.get` の `weather.daily`）の応答に、
 * 昨日・今日・明日の天気を差し込んで確かめる（天気の画面は、昨日の前にもう 1 ページある）。
 * WHY NOT 時計を止める（`page.clock`）: 偽の Date では JST の暦日の計算（`@date-fns/tz`）が壊れる。
 * 18 時の切り替えはユニットテストで確かめる（`src/features/weather/__tests__/queries.test.ts`）。
 */
/** 週間天気の画面の URL（開いた日が検索パラメータに付くことがある） */
const WEEKLY = /\/weather(\?|$)/;
const TODAY = today();
const TOMORROW = addDays(TODAY, 1);
const YESTERDAY = addDays(TODAY, -1);
const EARLIER = addDays(TODAY, -20);
const SUNNY: DailyWeather = {
  date: TODAY,
  icon: { symbol: 'sun' },
  label: '晴',
  tempMax: 25,
  tempMin: 14,
  pop: 10,
};
const WEEK: DailyWeather[] = [
  SUNNY,
  {
    date: TOMORROW,
    icon: { symbol: 'cloud', change: 'later', next: 'rain' },
    label: '曇のち雨',
    tempMax: 21,
    tempMin: 16,
    pop: 70,
  },
];

/**
 * 1 日ぶんの 3 時間ごとの天気（気温は 0 時の 15 度から 1 度ずつ上がる）と 6 時間ごとの降水確率
 * （0 時から 10・20・30・40%）。昨日は 1 日じゅう雨、今日・明日は晴れ
 */
const allDay = (
  symbol: 'sun' | 'rain',
  label: string,
): Pick<WeatherDay, 'holiday' | 'slots' | 'pops'> => ({
  holiday: false,
  slots: Array.from({ length: 8 }, (_, i) => ({ startMin: i * 180, symbol, label, temp: 15 + i })),
  pops: Array.from({ length: 4 }, (_, i) => ({ startMin: i * 360, pop: (i + 1) * 10 })),
});

/** before を省いた最新のページ（昨日・今日・明日）と、その前のページ（20 日前） */
const PAGES: Record<string, HistoryPage<WeatherDay>> = {
  latest: {
    items: [
      { ...SUNNY, date: YESTERDAY, label: '雨', ...allDay('rain', '雨') },
      ...WEEK.map((day) => ({ ...day, ...allDay('sun', '晴れ') })),
    ],
    nextCursor: YESTERDAY,
  },
  [YESTERDAY]: {
    items: [{ ...SUNNY, date: EARLIER, label: '雪', holiday: false, slots: [], pops: [] }],
    nextCursor: null,
  },
};

/** 予定画面の日付の横に出す天気（過ぎた日から開くとき用に、昨日と 20 日前も） */
const CALENDAR_DAYS: DailyWeather[] = [
  { ...SUNNY, date: EARLIER, label: '雪' },
  { ...SUNNY, date: YESTERDAY, label: '雨' },
  ...WEEK,
];

test.beforeEach(async ({ page }) => {
  await rewriteJson(
    page,
    'weather.page',
    (input) => PAGES[(input as { before?: string } | undefined)?.before ?? 'latest'],
  );
  await rewriteJson(page, 'calendar.get', async (_input, real) => ({
    ...((await real()) as object),
    weather: { daily: CALENDAR_DAYS, hourly: [] },
  }));
});

/** 見出しのボタンの名前（"2026年09月27日（日）"）の頭 */
const dateLabel = (date: string) =>
  new RegExp(`^${date.slice(0, 4)}年${date.slice(5, 7)}月${date.slice(8, 10)}日`);

/** 直前の遷移の前後で撮られた、天気のアイコンの名前 */
async function iconNames(page: Page) {
  const last = (await transitions(page)).at(-1);
  const icons = (names: string[] = []) => names.filter((name) => name.startsWith('weather-icon-'));
  return { before: icons(last?.before), after: icons(last?.captured) };
}

async function openWeeklyFrom(page: Page, link: ReturnType<Page['getByRole']>) {
  await link.click();
  await expect(page).toHaveURL(WEEKLY);
  // 明日の行に天気の名前と降水確率が並ぶ
  await expect(page.getByRole('listitem').filter({ hasText: '70%' })).toContainText('曇のち雨');
}

test('ホームの天気のタイルに今日か明日の天気が出て、押すと週間天気が開く', async ({ page }) => {
  await page.goto('/');
  // 18 時までは今日、それからは明日
  const [label, name, temps] =
    minutesOfDay(new Date()) < 18 * 60
      ? ['今日', '晴', '25° / 14°']
      : ['明日', '曇のち雨', '21° / 16°'];
  const tile = page.getByRole('button', { name: new RegExp(`^${label}`) });
  await expect(tile).toContainText(name);
  await expect(tile).toContainText(temps);
  await openWeeklyFrom(page, tile);
});

test('ホームと週間天気を行き来すると、天気のタイルとその日の行が同じ名前で前後の画面に在る', async ({
  page,
}) => {
  await recordViewTransitions(page);
  await page.goto('/');
  const [label, date] = minutesOfDay(new Date()) < 18 * 60 ? ['今日', TODAY] : ['明日', TOMORROW];
  await openWeeklyFrom(page, page.getByRole('button', { name: new RegExp(`^${label}`) }));
  await settle(page);
  expect(await captured(page)).toContain('home-weather');
  // 名前はタイルに出ている日の行に在る（重なれば遷移が失敗するので、ほかの行に無いことは下の ready で分かる）
  await expect(page.locator(`li[data-date="${date}"]`).getByRole('button').first()).toHaveCSS(
    'view-transition-name',
    'home-weather',
  );

  await page.getByRole('button', { name: '戻る' }).click();
  await expect(page).toHaveURL('/');
  await settle(page);
  expect(await captured(page)).toContain('home-weather');
  expect((await transitions(page)).every((t) => t.ready === 'ok')).toBe(true);
});

test('予定画面と週間天気を行き来すると押した日のアイコンだけが前後の画面に同じ名前で在り、ホームへ移るときは無い', async ({
  page,
}) => {
  // 動くのは押した日だけ。前後の両方で確かめる
  const onlyToday = { before: [`weather-icon-${TODAY}`], after: [`weather-icon-${TODAY}`] };
  await recordViewTransitions(page);
  await openCalendarAfterWeekly(page);
  await openWeeklyFrom(page, page.getByRole('link', { name: /^週間天気（晴/ }));
  await settle(page);
  expect(await iconNames(page)).toEqual(onlyToday);

  await page.getByRole('button', { name: '戻る' }).click();
  await expect(page).toHaveURL(/\/calendar/);
  await settle(page);
  expect(await iconNames(page)).toEqual(onlyToday);
  expect((await transitions(page)).every((t) => t.ready === 'ok')).toBe(true);

  // ホームと予定画面の両方に同じ日のアイコンがあるので、名前があるとタイルのアイコンが日付の横から飛んでくる
  await page.getByRole('link', { name: 'ホーム' }).click();
  await expect(page).toHaveURL('/');
  await settle(page);
  expect(await iconNames(page)).toEqual({ before: [], after: [] });
});

/**
 * ホームから予定画面を開く。その前に週間天気を一度開いて戻る。
 * - 天気の日々がキャッシュにあるときだけ、週間天気の撮られる時点に行が載って動く（無ければ骨組みでフェードする）
 * - 画面のコードを初めて読む間は、前の画面が隠されてから遷移が始まる（Suspense）ので、前の画面が撮られない
 * どちらも使っていれば済んでいることなので、使うときの順（ホーム → 週間天気 → 戻る → 予定）で揃えておく
 */
async function openCalendarAfterWeekly(page: Page) {
  await page.goto('/');
  await openWeeklyFrom(page, page.getByRole('button', { name: /^(今日|明日)/ }));
  await page.getByRole('button', { name: '戻る' }).click();
  await expect(page).toHaveURL('/');
  await page.getByRole('link', { name: '予定' }).click();
  await expect(page).toHaveURL(/\/calendar/);
  await settle(page);
}

/** 行（開いた 3 時間ごとの天気を含まない部分）が、AppBar の下から画面の下端までに収まっているか */
async function expectRowVisible(page: Page, date: string) {
  const row = page.locator(`li[data-date="${date}"]`).getByRole('button').first();
  await expect(row).toBeInViewport({ ratio: 1 });
  expect((await row.boundingBox())?.y).toBeGreaterThanOrEqual((await bottomOf(appBar(page))) - 1);
}

test('予定画面で過ぎた日の天気を押すと、週間天気はその日の行が見える位置で開き、アイコンはその行へ動く', async ({
  page,
}) => {
  await recordViewTransitions(page);
  await openCalendarAfterWeekly(page);
  // 予定画面は最初は月表示（前の日も同じ面に並ぶ）
  await page.getByRole('link', { name: /^週間天気（雨/ }).click();
  await expect(page).toHaveURL(WEEKLY);
  await settle(page);
  await expectRowVisible(page, YESTERDAY);
  expect(await iconNames(page)).toEqual({
    before: [`weather-icon-${YESTERDAY}`],
    after: [`weather-icon-${YESTERDAY}`],
  });
});

test('予定画面でまだ読んでいない古い日の天気を押すと、週間天気はそこまで読み足してその日の行を見せる', async ({
  page,
}) => {
  await page.goto(`/calendar?view=day&date=${EARLIER}`);
  await page.getByRole('link', { name: /^週間天気（雪/ }).click();
  await expect(page).toHaveURL(WEEKLY);
  await expect(page.locator(`li[data-date="${EARLIER}"]`)).toContainText('雪');
  await expectRowVisible(page, EARLIER);
});

test('予定画面の日付の横の天気を押すと週間天気が開く（日表示・月表示）', async ({ page }) => {
  await page.goto(`/calendar?view=day&date=${TODAY}`);
  await openWeeklyFrom(page, page.getByRole('link', { name: /^週間天気（晴/ }));

  await page.goto(`/calendar?view=month&date=${TODAY}`);
  await openWeeklyFrom(page, page.getByRole('link', { name: /^週間天気（曇のち雨/ }));
});

test('週表示の見出しは、天気の外を押すと日表示へ移る', async ({ page }) => {
  await page.goto(`/calendar?view=week&date=${TOMORROW}`);
  await page.getByRole('button', { name: dateLabel(TOMORROW) }).click();
  await expect(page).toHaveURL(new RegExp(`view=day.*date=${TOMORROW}|date=${TOMORROW}.*view=day`));
});

test('天気の画面は今日を一番上に出し、上へ戻ると過ぎた日を読み足す', async ({ page }) => {
  await page.goto('/weather');
  const today = page.locator(`li[data-date="${TODAY}"]`);
  await expect(today).toBeInViewport();
  // 今日の行の上端は AppBar のすぐ下
  const row = await today.boundingBox();
  expect(Math.abs((row?.y ?? 0) - (await bottomOf(appBar(page))))).toBeLessThan(2);

  await page.mouse.wheel(0, -2000);
  await expect(page.locator(`li[data-date="${EARLIER}"]`)).toContainText('雪');
});

test('今日と明日は 3 時間ごとの天気が開いていて、行を押すと開け閉めできる', async ({ page }) => {
  await page.goto('/weather');
  const row = (date: string) => page.locator(`li[data-date="${date}"]`).getByRole('button');
  await expect(row(TODAY)).toHaveAttribute('aria-expanded', 'true');
  await expect(row(TOMORROW)).toHaveAttribute('aria-expanded', 'true');
  await expect(row(YESTERDAY)).toHaveAttribute('aria-expanded', 'false');

  await row(YESTERDAY).click();
  await expect(row(YESTERDAY)).toHaveAttribute('aria-expanded', 'true');
  const yesterday = page.locator(`li[data-date="${YESTERDAY}"]`);
  await expect(yesterday.getByRole('img', { name: '雨' })).toHaveCount(8);
  // 3 時間ごとの気温と、6 時間ごとの降水確率
  await expect(yesterday).toContainText('15°');
  await expect(yesterday).toContainText('22°');
  await expect(yesterday).toContainText('40%');
  await row(TODAY).click();
  await expect(row(TODAY)).toHaveAttribute('aria-expanded', 'false');
});

test('天気の画面の戻るボタンで前の画面へ、直に開いたときはホームへ戻る', async ({ page }) => {
  await page.goto('/calendar?view=day');
  await page.getByRole('link', { name: /^週間天気/ }).click();
  await expect(page).toHaveURL(WEEKLY);
  await expect(appBar(page)).toContainText('東京');
  await page.getByRole('button', { name: '戻る' }).click();
  await expect(page).toHaveURL(/\/calendar/);

  await page.goto('/weather');
  await page.getByRole('button', { name: '戻る' }).click();
  await expect(page).toHaveURL('/');
});
