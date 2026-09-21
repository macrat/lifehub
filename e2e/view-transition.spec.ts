import { expect, type Page, test } from '@playwright/test';
import { E2E_USER } from './global-setup.ts';

/** 起きた遷移 1 つ分。ready は名前が重複していると失敗する（＝遷移が飛ばされる） */
type Transition = { ready: string; finished: boolean };

declare global {
  interface Window {
    /** このテストのための控え（document.startViewTransition を包んで記録する） */
    viewTransitions: Transition[];
  }
}

/**
 * 画面を移るときの View Transition（`src/main.tsx` の defaultViewTransition）。
 * 動きそのものは見た目なので、壊れると静かに何も動かなくなる次の 2 点だけを確かめる。
 * - 同じ `view-transition-name` が 2 つあると、遷移そのものが行われない（`ready` が失敗する）
 * - 前後の画面で同じものに同じ名前が付いていなければ、動かずに消えて出るだけになる
 * 併せて、同じ画面の中の更新（日付の移動）では遷移しないことも確かめる。
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.viewTransitions = [];
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = (update) => {
      const record: Transition = { ready: 'pending', finished: false };
      window.viewTransitions.push(record);
      const transition = start(update);
      transition.ready.then(
        () => {
          record.ready = 'ok';
        },
        (error: DOMException) => {
          record.ready = `${error.name}: ${error.message}`;
        },
      );
      transition.finished.then(() => {
        record.finished = true;
      });
      return transition;
    };
  });
  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill(E2E_USER.email);
  await page.getByLabel('パスワード').fill(E2E_USER.password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page).toHaveURL('/');
});

/** 今の画面に付いている view-transition-name（html の root を含む） */
const names = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('*')]
      .map((el) => getComputedStyle(el).viewTransitionName)
      .filter((name) => name !== 'none'),
  );

const transitions = (page: Page): Promise<Transition[]> =>
  page.evaluate(() => window.viewTransitions);

/** 遷移が終わる（＝新しい画面が DOM に出そろう）まで待つ */
const settle = (page: Page) =>
  page.waitForFunction(() => window.viewTransitions.at(-1)?.finished === true);

const changeView = async (page: Page, label: string) => {
  await page.getByRole('button', { name: '表示の切替' }).click();
  await page.getByRole('menuitem', { name: label, exact: true }).click();
  await settle(page);
};

test('カレンダーの表示を切り替えると、同じ予定が同じ名前で前後の画面に在る', async ({ page }) => {
  // 画面からの追加は他のテストで確かめているので、ここは API で用意する
  const users = await (await page.request.get('/api/users')).json();
  const participantIds = [users[0].id];
  const add = (body: Record<string, unknown>) =>
    page.request.post('/api/events', { data: { participantIds, ...body } });
  // 時刻のある予定、週をまたぐ終日の予定（月グリッドでは週の行ごとに帯が分かれる）、
  // 毎週の繰り返し（月グリッドに同じ id が 4 回出る）、タスク
  await add({
    kind: 'event',
    title: 'VT 単発',
    startsAt: '2030-03-13T01:00:00.000Z',
    endsAt: '2030-03-13T02:00:00.000Z',
  });
  await add({
    kind: 'event',
    title: 'VT 連泊',
    allDay: true,
    startsAt: '2030-03-11T15:00:00.000Z',
    endsAt: '2030-03-18T15:00:00.000Z',
  });
  await add({
    kind: 'event',
    title: 'VT 毎週',
    startsAt: '2030-03-11T00:00:00.000Z',
    endsAt: '2030-03-11T01:00:00.000Z',
    rrule: 'FREQ=WEEKLY',
  });
  await add({
    kind: 'task',
    title: 'VT タスク',
    startsAt: '2030-03-13T03:00:00.000Z',
    endsAt: '2030-03-13T04:00:00.000Z',
  });

  await page.goto('/calendar?view=month&date=2030-03-13');
  await expect(page.getByText('VT 単発')).toBeVisible();
  const month = await names(page);
  // 前後の月の面（inert）にも同じ予定が描かれているが、名前が重複してはいけない
  expect(new Set(month).size).toBe(month.length);

  await changeView(page, '日');
  const day = await names(page);
  expect(new Set(day).size).toBe(day.length);
  // その日の分だけが出て、いずれも月表示と同じ名前（＝その場から動く）
  expect(day.length).toBeLessThan(month.length);
  expect(day.filter((name) => !month.includes(name))).toEqual([]);
  expect(day.some((name) => name.startsWith('item-event-'))).toBe(true);
  expect(day.some((name) => name.startsWith('item-task-'))).toBe(true);

  await changeView(page, 'リスト');
  const list = await names(page);
  expect(new Set(list).size).toBe(list.length);
  expect(day.filter((name) => !list.includes(name))).toEqual([]);

  expect(await transitions(page)).toEqual(
    expect.arrayContaining([{ ready: 'ok', finished: true }]),
  );
  expect((await transitions(page)).every((t) => t.ready === 'ok')).toBe(true);

  // 日付だけが変わる移動（今日へ）は同じ画面の中の更新なので遷移しない
  await changeView(page, '週');
  const before = (await transitions(page)).length;
  await page.getByRole('button', { name: '今日' }).click();
  await expect(page).toHaveURL(/date=/);
  expect((await transitions(page)).length).toBe(before);
});

test('ホームと立替・レモンを行き来すると、残高とカードが同じ名前で前後の画面に在る', async ({
  page,
}) => {
  await expect(page.getByRole('heading', { name: '立替残高' })).toBeVisible();
  const home = await names(page);
  expect(home).toContain('balance');
  expect(home).toContain('care-water');
  expect(new Set(home).size).toBe(home.length);

  await page.getByRole('button', { name: '立替残高' }).click();
  await expect(page).toHaveURL('/expenses');
  await settle(page);
  expect(await names(page)).toContain('balance');

  await page.getByRole('link', { name: 'ホーム' }).click();
  await expect(page).toHaveURL('/');
  await settle(page);
  await page.getByRole('button', { name: 'レモン' }).click();
  await expect(page).toHaveURL('/lemon');
  await settle(page);
  expect(await names(page)).toContain('care-water');

  expect((await transitions(page)).every((t) => t.ready === 'ok')).toBe(true);
});
