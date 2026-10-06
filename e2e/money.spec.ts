import { addDays, today } from '../shared/date.ts';
import {
  type MoneyAccount,
  type MoneyBalance,
  type MoneyEntry,
  type MoneyTransaction,
  sortMoneyEntries,
  transactionMoneyEntry,
} from '../shared/money.ts';
import { type TimelineEntry, transactionEntry } from '../shared/timeline.ts';
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

const SUPERMARKET: MoneyTransaction = {
  id: '01990000-0000-7000-8000-000000000001',
  account: 'テストカード',
  occurredOn: TODAY,
  description: 'E2E スーパー',
  amount: -3200,
  parties: null,
};

test.beforeEach(async ({ page }) => {
  await rewriteJson(page, 'money.accounts', () => ACCOUNTS);
  // 最新のページに、本物の立替と並べて入出金を 1 件差し込む
  await rewriteJson(page, 'expenses.list', async (input, real) => {
    const latest = (await real()) as HistoryPage<MoneyEntry>;
    if ((input as { before?: string } | undefined)?.before) return latest;
    return {
      ...latest,
      items: sortMoneyEntries([transactionMoneyEntry(SUPERMARKET), ...latest.items]),
    };
  });
  await rewriteJson(page, 'timeline.get', async (input, real) => {
    const latest = (await real()) as HistoryPage<TimelineEntry>;
    if ((input as { before?: string } | undefined)?.before) return latest;
    return { ...latest, items: [transactionEntry(SUPERMARKET), ...latest.items] };
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
});

test('取り込んだ入出金はホームのタイムラインに金融機関と金額で並ぶ', async ({ page }) => {
  await page.goto('/');
  const row = page.getByRole('button', { name: new RegExp(SUPERMARKET.description) });
  await expect(row).toHaveAccessibleName(/テストカード/);
  await expect(page.getByText(`¥-3,200 ${SUPERMARKET.description}`)).toBeVisible();
  await row.click();
  await expect(page.getByRole('dialog', { name: SUPERMARKET.description })).toBeVisible();
});

test('入出金のルールを設定画面から足して並べ替え・削除でき、欄は種別と置換のスイッチで無効になる', async ({
  page,
}) => {
  const api = apiOf(page.request);
  await api.money.saveRules.mutate([]);
  const savedPatterns = () => api.money.rules.query().then((rules) => rules.map((r) => r.pattern));

  await page.goto('/settings');
  await page.getByRole('link', { name: /入出金のルール/ }).click();
  await expect(page).toHaveURL('/admin/money-rules');

  await page.getByRole('button', { name: 'ルールを追加' }).click();
  await page.getByRole('button', { name: 'ルールを追加' }).click();
  const patterns = page.getByLabel('パターン（正規表現）');
  const replacements = page.getByLabel('置換後の内容欄');
  // 置換しないうちは置換後の内容欄を、支出のうちは対象者を選べない
  await expect(replacements.first()).toBeDisabled();
  await expect(page.getByLabel('対象者').first()).toHaveAttribute('aria-disabled', 'true');

  // 正規表現として読めなければ誤りを出し、直すまで保存しない
  await patterns.nth(0).fill('(');
  await patterns.nth(0).blur();
  await expect(page.getByText('正規表現として読めません')).toBeVisible();
  await patterns.nth(0).fill('ATM');
  await patterns.nth(1).fill('振込 (\\S+)');
  await patterns.nth(1).blur();
  await expect.poll(savedPatterns).toEqual(['ATM', '振込 (\\S+)']);

  // 2 つ目の取っ手を 1 つ目の上へ引く。引き始めと、1 つ目が下へ避けたのを見届けてから離す
  // （並べ替えの部品は位置を測ってから動かす）
  const handles = page.getByRole('button', { name: '並べ替え' });
  const from = await handles.nth(1).boundingBox();
  const to = await handles.nth(0).boundingBox();
  if (!from || !to) throw new Error('取っ手が見えない');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y, { steps: 2 });
  await expect(page.getByRole('region', { name: 'ルール 2' })).toHaveAttribute(
    'style',
    /translate/,
  );
  await page.mouse.move(to.x + to.width / 2, to.y - 10, { steps: 10 });
  await expect(page.getByRole('region', { name: 'ルール 1' })).toHaveAttribute(
    'style',
    /translate/,
  );
  await page.mouse.up();
  await expect(patterns.nth(0)).toHaveValue('振込 (\\S+)');
  await expect.poll(savedPatterns).toEqual(['振込 (\\S+)', 'ATM']);

  await page.getByLabel('内容欄を置換').nth(0).check();
  await replacements.nth(0).fill('$1 さん');
  await replacements.nth(0).blur();
  await page.getByLabel('種別').nth(0).click();
  await page.getByRole('option', { name: '入金' }).click();
  await expect(page.getByLabel('対象者').nth(0)).not.toHaveAttribute('aria-disabled', 'true');
  await page.getByLabel('一覧に表示しない').nth(0).check();
  await expect
    .poll(() => api.money.rules.query().then((rules) => rules[0]))
    .toMatchObject({
      replaceDescription: true,
      replacement: '$1 さん',
      kind: 'deposit',
      hidden: true,
    });

  // 開き直しても同じ並び
  await page.reload();
  await expect(patterns.nth(0)).toHaveValue('振込 (\\S+)');
  await expect(replacements.nth(0)).toHaveValue('$1 さん');
  await expect(page.getByLabel('一覧に表示しない').nth(0)).toBeChecked();
  await expect(patterns.nth(1)).toHaveValue('ATM');

  await page.getByRole('button', { name: 'ルールを削除' }).nth(0).click();
  await expect(patterns).toHaveCount(1);
  await page.getByRole('button', { name: 'ルールを削除' }).nth(0).click();
  await expect.poll(savedPatterns).toEqual([]);
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
