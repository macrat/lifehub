import type { Page } from '@playwright/test';
import { openHome } from './auth.ts';
import { addItem } from './events.ts';
import { expect, test } from './test.ts';
import { captured, changeView, recordViewTransitions, settle, transitions } from './view.ts';

/**
 * 画面を移るときの View Transition（`src/main.tsx` の defaultViewTransition）。
 * 動きそのものは見た目なので、壊れると静かに何も動かなくなる次の 2 点だけを確かめる。
 * - 同じ `view-transition-name` が 2 つあると、遷移そのものが行われない（`ready` が失敗する）
 * - 前後の画面で同じものに同じ名前が付いていなければ、動かずに消えて出るだけになる
 * どの移動で遷移するか（同じ画面の中の更新では遷移しない）は `src/lib/__tests__/view-transition.test.ts`。
 *
 * 名前は遷移が終わったあとの DOM ではなく、ブラウザが遷移後として撮る時点
 * （更新コールバックが解決した直後）で数える。あとから足される物は動かないので、
 * 終わったあとの DOM を見ると「動いていない」ことに気づけない。
 * 遷移の記録と待ちは `view.ts`（他のテストも同じ仕掛けで表示の切り替えを待つ）。
 */
test.beforeEach(async ({ page }) => {
  await recordViewTransitions(page);
});

/** 今の画面に付いている view-transition-name（html の root を含む） */
const names = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('*')]
      .map((el) => getComputedStyle(el).viewTransitionName)
      .filter((name) => name !== 'none'),
  );

test('カレンダーの表示を切り替えると、同じ予定が同じ名前で前後の画面に在る', async ({ page }) => {
  // 画面からの追加は他のテストで確かめているので、ここは API で用意する。
  // 題に印を付けて、CI で再試行したときに前の試行の予定と見分ける
  const stamp = Date.now();
  const add = (item: Parameters<typeof addItem>[1]) =>
    addItem(page, { ...item, title: `${item.title} ${stamp}` });
  // 時刻のある予定、週をまたぐ終日の予定（月グリッドでは週の行ごとに帯が分かれる）、
  // 毎週の繰り返し（月グリッドに同じ id が 4 回出る）、タスク
  await Promise.all([
    add({
      kind: 'event',
      title: 'VT 単発',
      startsAt: '2030-03-13T01:00:00.000Z',
      endsAt: '2030-03-13T02:00:00.000Z',
    }),
    add({
      kind: 'event',
      title: 'VT 連泊',
      allDay: true,
      startsAt: '2030-03-11T15:00:00.000Z',
      endsAt: '2030-03-18T15:00:00.000Z',
    }),
    add({
      kind: 'event',
      title: 'VT 毎週',
      startsAt: '2030-03-11T00:00:00.000Z',
      endsAt: '2030-03-11T01:00:00.000Z',
      rrule: 'FREQ=WEEKLY',
    }),
    add({
      kind: 'task',
      title: 'VT タスク',
      startsAt: '2030-03-13T03:00:00.000Z',
    }),
  ]);

  await page.goto('/calendar?view=month&date=2030-03-13');
  await expect(page.getByText(`VT 単発 ${stamp}`)).toBeVisible();
  const month = await names(page);
  // 前後の月の面（inert）にも同じ予定が描かれているが、名前が重複してはいけない
  expect(new Set(month).size).toBe(month.length);

  await changeView(page, '日');
  const day = await captured(page);
  expect(new Set(day).size).toBe(day.length);
  // その日の分だけが出て、いずれも月表示と同じ名前（＝その場から動く）
  expect(day.length).toBeLessThan(month.length);
  expect(day.filter((name) => !month.includes(name))).toEqual([]);
  expect(day.some((name) => name.startsWith('item-event-'))).toBe(true);
  expect(day.some((name) => name.startsWith('item-task-'))).toBe(true);

  await changeView(page, 'リスト');
  const list = await captured(page);
  expect(new Set(list).size).toBe(list.length);
  expect(day.filter((name) => !list.includes(name))).toEqual([]);

  // 月・週・日へ向かう切り替えでも、撮られる時点に項目が載っている（載っていないと動かずに出るだけ。
  // 月グリッドは入りきらない項目を「+n」にまとめるので、リストとの一致ではなく在ることを確かめる）
  await changeView(page, '月');
  const backToMonth = await captured(page);
  expect(new Set(backToMonth).size).toBe(backToMonth.length);
  expect(backToMonth.some((name) => name.startsWith('item-event-'))).toBe(true);
  expect(backToMonth.some((name) => name.startsWith('item-task-'))).toBe(true);

  const done = await transitions(page);
  expect(done.length).toBeGreaterThan(0);
  expect(done.every((t) => t.ready === 'ok' && t.finished)).toBe(true);
});

test('ホームとレモンを行き来すると、タイルが同じ名前で前後の画面に在る', async ({ page }) => {
  // ホームのタイムラインの予定・タスクには名前が無い（予定画面との間では動かずフェードする）。
  // 名前を付けると、スクロールの外にある項目まで画面の外から飛んでくる（`item-transition.ts`）
  const title = `VT ホーム ${Date.now()}`;
  await addItem(page, { kind: 'task', title });
  await openHome(page);
  await expect(page.getByRole('button', { name: /^水やり/ })).toBeVisible();
  await expect(page.getByText(title)).toBeVisible();
  const home = await names(page);
  expect(home).toContain('care-water');
  expect(new Set(home).size).toBe(home.length);
  expect(home.filter((name) => name.startsWith('item-'))).toEqual([]);

  await page.getByRole('link', { name: 'レモン' }).click();
  await expect(page).toHaveURL('/lemon');
  await settle(page);
  expect(await names(page)).toContain('care-water');

  expect((await transitions(page)).every((t) => t.ready === 'ok')).toBe(true);
});
