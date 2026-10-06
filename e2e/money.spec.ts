import { today } from '../shared/date.ts';
import {
  type MoneyAccount,
  type MoneyEntry,
  type MoneyTransaction,
  sortMoneyEntries,
  transactionMoneyEntry,
} from '../shared/money.ts';
import { type TimelineEntry, transactionEntry } from '../shared/timeline.ts';
import type { HistoryPage } from '../shared/types.ts';
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
};

test.beforeEach(async ({ page }) => {
  await rewriteJson(page, 'money.accounts', () => ACCOUNTS);
  // 最新のページに、本物の立替と並べて入出金を 1 件差し込む
  await rewriteJson(page, 'money.list', async (input, real) => {
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
  await expect(accounts).toContainText('引き落とし');

  // 立替は今までどおり足せて、同じ一覧に並ぶ
  await page.getByRole('button', { name: '立替を追加' }).click();
  await page.getByLabel('金額（円）').fill('1000');
  await page.getByLabel('内容', { exact: true }).fill(description);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText(description)).toBeVisible();
  await expect(page.getByRole('main')).toContainText('-¥3,200');

  // 行の押せる範囲は中身の下に敷いたボタンで、名前は中身の文字（`PressableRow`）
  await page.getByRole('button', { name: new RegExp(SUPERMARKET.description) }).click();
  const detail = page.getByRole('dialog', { name: SUPERMARKET.description });
  await expect(detail).toContainText('-¥3,200');
  // 取り込んだ物は直せない
  await expect(detail.getByRole('button', { name: '編集' })).toHaveCount(0);
});

test('取り込んだ入出金はホームのタイムラインに金融機関と金額で並ぶ', async ({ page }) => {
  await page.goto('/');
  const row = page.getByRole('button', { name: new RegExp(SUPERMARKET.description) });
  await expect(row).toHaveAccessibleName(/テストカード/);
  await expect(page.getByText(`-¥3,200 ${SUPERMARKET.description}`)).toBeVisible();
  await row.click();
  await expect(page.getByRole('dialog', { name: SUPERMARKET.description })).toBeVisible();
});
