import { addDays, today } from '../shared/date.ts';
import {
  type MoneyAccount,
  type MoneyBalance,
  type MoneyRecord,
  sortMoneyRecords,
} from '../shared/money.ts';
import { expenseEntry, type TimelineEntry } from '../shared/timeline.ts';
import type { HistoryPage } from '../shared/types.ts';
import { apiOf } from './api.ts';
import { rewriteJson } from './network.ts';
import { expect, test } from './test.ts';

/**
 * 口座と入出金は Cron が Money Forward から取り込んだ物を読むだけで、E2E の DB には入らない（取り込みは
 * サーバーのテスト `server/features/money/__tests__/service.test.ts` で確かめる）。
 * 口座（`money.accounts`）・お金の画面の一覧（`money.list`）・タイムライン（`timeline.get`）の応答に差し込んで確かめる。
 */
const TODAY = today();

const ACCOUNTS: MoneyAccount[] = [
  {
    name: 'テスト銀行',
    kind: 'bank',
    balance: 1_234_567,
    withdrawalAmount: null,
    withdrawalOn: null,
    fetchedAt: new Date().toISOString(),
  },
  {
    name: 'テストカード',
    kind: 'card',
    balance: null,
    withdrawalAmount: 42_000,
    withdrawalOn: TODAY,
    fetchedAt: new Date().toISOString(),
  },
];

/** 取り込んだ入出金（account を持つお金の記録）。当事者を持たない、ただの支出 */
const SUPERMARKET: MoneyRecord = {
  id: '01990000-0000-7000-8000-000000000001',
  fromUserId: null,
  toUserId: null,
  amount: -3200,
  description: 'E2E スーパー',
  occurredOn: TODAY,
  createdAt: new Date(0).toISOString(),
  account: 'テストカード',
};

test.beforeEach(async ({ page }) => {
  await rewriteJson(page, 'money.accounts', () => ACCOUNTS);
  // 最新のページに、本物の立替と並べて入出金を 1 件差し込む
  await rewriteJson(page, 'money.list', async (input, real) => {
    const latest = (await real()) as HistoryPage<MoneyRecord>;
    if ((input as { before?: string } | undefined)?.before) return latest;
    return { ...latest, items: sortMoneyRecords([SUPERMARKET, ...latest.items]) };
  });
  await rewriteJson(page, 'timeline.get', async (input, real) => {
    const latest = (await real()) as HistoryPage<TimelineEntry>;
    if ((input as { before?: string } | undefined)?.before) return latest;
    return { ...latest, items: [expenseEntry(SUPERMARKET), ...latest.items] };
  });
});

test('お金の画面に口座の残高とカードの次回の引き落としが並び、立替と入出金が 1 本の一覧に並ぶ', async ({
  page,
}) => {
  const description = `E2E 立替 ${Date.now()}`;
  await page.goto('/money');
  const accounts = page.getByRole('region', { name: '口座' });
  await expect(accounts).toContainText('テスト銀行');
  await expect(accounts).toContainText('¥1,234,567');
  await expect(accounts).toContainText('¥42,000');
  // カードの引き落とし日は曜日を付けずに「次回 10/27」
  await expect(accounts).toContainText(
    `次回 ${Number(TODAY.slice(5, 7))}/${Number(TODAY.slice(8, 10))}`,
  );

  // 立替は今までどおり足せて、同じ一覧に並ぶ
  await page.getByRole('button', { name: '立替を追加' }).click();
  await page.getByLabel('金額（円）').fill('1000');
  await page.getByLabel('内容', { exact: true }).fill(description);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText(description)).toBeVisible();
  await expect(page.getByRole('main')).toContainText('¥-3,200');

  // 行の押せる範囲は中身の下に敷いたボタンで、名前は中身の文字（`PressableRow`）
  await page.getByRole('button', { name: new RegExp(SUPERMARKET.description) }).click();
  const detail = page.getByRole('dialog', { name: SUPERMARKET.description });
  await expect(detail).toContainText('¥-3,200');
  // 取り込んだ物は直せない
  await expect(detail.getByRole('button', { name: '編集' })).toHaveCount(0);

  // 精算は他のテストと共有するので片付ける（settlements.spec.ts は精算済みから始まる前提）
  const api = apiOf(page.request);
  const { items } = await api.money.list.query({ q: description });
  for (const { id } of items) await api.money.delete.mutate({ id });
});

test('取り込んだ入出金はホームのタイムラインに金融機関と金額で並ぶ', async ({ page }) => {
  await page.goto('/');
  const row = page.getByRole('button', { name: new RegExp(SUPERMARKET.description) });
  await expect(row).toHaveAccessibleName(/テストカード/);
  await expect(page.getByText(`¥-3,200 ${SUPERMARKET.description}`)).toBeVisible();
  await row.click();
  await expect(page.getByRole('dialog', { name: SUPERMARKET.description })).toBeVisible();
});

test('取り込みルールを設定画面から足して直し、取っ手で並べ替えて削除でき、欄は種別と置換のスイッチで無効になる', async ({
  page,
}) => {
  const api = apiOf(page.request);
  await api.money.saveRules.mutate([]);
  const savedPatterns = () => api.money.rules.query().then((rules) => rules.map((r) => r.pattern));

  await page.goto('/settings');
  await page.getByRole('link', { name: '取り込みルール' }).click();
  await expect(page).toHaveURL('/admin/money-rules');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('取り込みルール');

  // 追加のシート: 置換しないうちは置換後の内容欄を、支出のうちは対象者を選べない。正規表現として読めなければ保存しない
  await page.getByRole('button', { name: 'ルールを追加' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByLabel('置換後の内容欄')).toBeDisabled();
  await expect(sheet.getByLabel('対象者')).toHaveAttribute('aria-disabled', 'true');
  await sheet.getByLabel('パターン（正規表現）').fill('(');
  await sheet.getByRole('button', { name: '保存' }).click();
  await expect(sheet.getByText('正規表現として読めません')).toBeVisible();
  await sheet.getByLabel('パターン（正規表現）').fill('ATM');
  await sheet.getByRole('button', { name: '保存' }).click();
  await expect(sheet).toHaveCount(0);

  await page.getByRole('button', { name: 'ルールを追加' }).click();
  await sheet.getByLabel('パターン（正規表現）').fill('振込 (\\S+)');
  await sheet.getByLabel('内容欄を置換').check();
  await sheet.getByLabel('置換後の内容欄').fill('$1 さん');
  await sheet.getByLabel('種別').click();
  await page.getByRole('option', { name: '入金' }).click();
  await expect(sheet.getByLabel('対象者')).not.toHaveAttribute('aria-disabled', 'true');
  await sheet.getByLabel('一覧に表示しない').check();
  await sheet.getByRole('button', { name: '保存' }).click();
  await expect.poll(savedPatterns).toEqual(['ATM', '振込 (\\S+)']);
  await expect
    .poll(() => api.money.rules.query().then((rules) => rules[1]))
    .toMatchObject({
      replaceDescription: true,
      replacement: '$1 さん',
      kind: 'deposit',
      hidden: true,
    });
  // 一覧の説明は置換・種別と対象者・一覧に表示しない
  const rows = page.getByRole('main').getByRole('listitem');
  await expect(rows.nth(1)).toContainText('「$1 さん」に置換・入金 E2E・一覧に表示しない');

  // 鉛筆で直す
  await page.getByRole('button', { name: 'ATM を編集' }).click();
  await sheet.getByLabel('パターン（正規表現）').fill('ATM .*');
  await sheet.getByRole('button', { name: '保存' }).click();
  await expect.poll(savedPatterns).toEqual(['ATM .*', '振込 (\\S+)']);

  // 2 つ目の行の取っ手を 1 つ目の上へ引く。引き始めと、1 つ目が下へ避けたのを見届けてから離す
  // （並べ替えの部品は位置を測ってから動かす）
  const handles = page.getByRole('button', { name: '並べ替え' });
  const from = await handles.nth(1).boundingBox();
  const to = await handles.nth(0).boundingBox();
  if (!from || !to) throw new Error('取っ手が見えない');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y, { steps: 2 });
  await expect(rows.nth(1)).toHaveAttribute('style', /translate/);
  await page.mouse.move(to.x + to.width / 2, to.y - 10, { steps: 10 });
  await expect(rows.nth(0)).toHaveAttribute('style', /translate/);
  await page.mouse.up();
  await expect.poll(savedPatterns).toEqual(['振込 (\\S+)', 'ATM .*']);

  // 削除は鉛筆で開いたシートの三点リーダー
  page.on('dialog', (dialog) => dialog.accept());
  for (const name of ['ATM .* を編集', '振込 (\\S+) を編集']) {
    await page.getByRole('button', { name }).click();
    await sheet.getByRole('button', { name: 'その他の操作' }).click();
    await page.getByRole('menuitem', { name: '削除' }).click();
  }
  await expect.poll(savedPatterns).toEqual([]);
  await expect(page.getByText('取り込みルールはありません')).toBeVisible();
});

test('口座のタイルを押すとその口座の推移のグラフが開き、絞り込みで口座を足すと積み上げて出す', async ({
  page,
}) => {
  // 口座の値の記録は取り込みが残すもので E2E の DB には無いので、推移の 1 ページ（最後のページ）を差し込む
  const balances: MoneyBalance[] = [-2, -1, 0].flatMap((offset) => [
    { account: 'テスト銀行', on: addDays(TODAY, offset), amount: 1_200_000 + offset * 10_000 },
    { account: 'テストカード', on: addDays(TODAY, offset), amount: -40_000 + offset * 1_000 },
  ]);
  await rewriteJson(page, 'money.balances', () => ({ items: balances, nextCursor: null }));
  await page.goto('/money');
  await page
    .getByRole('region', { name: '口座' })
    .getByRole('button', { name: /テスト銀行/ })
    .click();
  await expect(page).toHaveURL(/\/money\/balances\?accounts=/);

  // AppBar に出している期間（最初は今日までの過去 3 か月）。グラフは ECharts が読み上げ用の説明を付ける
  const [, month, date] = TODAY.split('-').map(Number);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(`〜 ${month}/${date}`);
  const chart = page.locator('[aria-label*="テスト銀行"]');
  await expect(chart).toBeVisible();
  await expect(chart).not.toHaveAttribute('aria-label', /テストカード/);

  await page.getByRole('button', { name: '絞り込み' }).click();
  await expect(page.getByRole('checkbox', { name: 'テスト銀行' })).toBeChecked();
  await page.getByRole('checkbox', { name: 'テストカード' }).check();
  await expect(page).toHaveURL(/accounts=.*accounts=/);
  await expect(chart).toHaveAttribute('aria-label', /テストカード/);

  // 戻るとお金の画面（口座の選び直しは履歴に積まない）
  await page.getByRole('button', { name: '戻る' }).click();
  await expect(page).toHaveURL('/money');
});
