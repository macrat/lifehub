import { today } from '../shared/date.ts';
import type { MoneyAccount, MoneyTransaction } from '../shared/money.ts';
import { type TimelineEntry, transactionEntry } from '../shared/timeline.ts';
import type { HistoryPage } from '../shared/types.ts';
import { rewriteJson } from './network.ts';
import { expect, test } from './test.ts';

/**
 * 口座と入出金は Cron が Money Forward から取り込んだ物を読むだけで、E2E の DB には入らない（取り込みは
 * サーバーのテスト `server/features/money/__tests__/service.test.ts` で確かめる）。
 * 口座（`money.accounts`）・入出金の履歴（`money.transactions`）・タイムライン（`timeline.get`）の応答に差し込んで確かめる。
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
    balance: -42_000,
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
  category: '食費 / 食料品',
};

test.beforeEach(async ({ page }) => {
  await rewriteJson(page, 'money.accounts', () => ACCOUNTS);
  await rewriteJson(
    page,
    'money.transactions',
    (): HistoryPage<MoneyTransaction> => ({ items: [SUPERMARKET], nextCursor: null }),
  );
  await rewriteJson(page, 'timeline.get', async (input, real) => {
    const latest = (await real()) as HistoryPage<TimelineEntry>;
    if ((input as { before?: string } | undefined)?.before) return latest;
    return { ...latest, items: [transactionEntry(SUPERMARKET), ...latest.items] };
  });
});

test('お金の画面に口座の残高とカードの次回の引き落としが並び、カードを押すとその入出金が開いて詳細を読める', async ({
  page,
}) => {
  await page.goto('/money');
  const accounts = page.getByRole('region', { name: '口座' });
  await expect(accounts.getByRole('button', { name: /テスト銀行/ })).toContainText('¥1,234,567');
  const card = accounts.getByRole('button', { name: /テストカード/ });
  await expect(card).toContainText('¥42,000');
  await expect(card).toContainText('引き落とし');

  await card.click();
  await expect(page).toHaveURL(/view=transactions/);
  await expect(page.getByRole('tab', { name: '入出金' })).toHaveAttribute('aria-selected', 'true');
  // 入出金の一覧では精算を出さない（立替の物なので）
  await expect(page.getByRole('region', { name: '精算' })).toHaveCount(0);
  await expect(page.getByText('テストカード・食費 / 食料品')).toBeVisible();
  await expect(page.getByRole('main')).toContainText('-¥3,200');

  // 行の押せる範囲は中身の下に敷いたボタンで、名前は中身の文字（`PressableRow`）
  await page.getByRole('button', { name: new RegExp(SUPERMARKET.description) }).click();
  const detail = page.getByRole('dialog', { name: SUPERMARKET.description });
  await expect(detail).toContainText('-¥3,200');
  // 取り込んだ物は直せない
  await expect(detail.getByRole('button', { name: '編集' })).toHaveCount(0);
  await detail.getByRole('button', { name: '閉じる' }).click();

  await page.getByRole('tab', { name: '立替' }).click();
  await expect(page.getByRole('region', { name: '精算' })).toBeVisible();
});

test('取り込んだ入出金はホームのタイムラインに金融機関と金額で並ぶ', async ({ page }) => {
  await page.goto('/');
  const row = page.getByRole('button', { name: new RegExp(SUPERMARKET.description) });
  await expect(row).toHaveAccessibleName(/テストカード/);
  await expect(page.getByText(`-¥3,200 ${SUPERMARKET.description}`)).toBeVisible();
  await row.click();
  await expect(page.getByRole('dialog', { name: SUPERMARKET.description })).toBeVisible();
});
