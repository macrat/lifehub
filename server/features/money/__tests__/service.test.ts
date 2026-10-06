import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newId } from '../../../../shared/id.ts';
import { dateStringSchema } from '../../../../shared/validation/common.ts';
import type { ExpenseListQuery } from '../../../../shared/validation/expenses.ts';
import { db } from '../../../lib/db/client.ts';
import { clearTables } from '../../../lib/db/test-db.ts';
import { getTimelinePage } from '../../timeline/service.ts';
import * as moneyforward from '../moneyforward.ts';
import {
  matchAccount,
  parseTransactionsCsv,
  parseWithdrawalAmount,
  parseWithdrawalDate,
  parseYen,
} from '../parse.ts';
import { moneyAccounts, moneyTransactions } from '../schema.ts';
import { listAccounts, listMoney, syncMoneyForward } from '../service.ts';

/** お金の画面の一覧の 1 ページから入出金だけ（絞り込みは立替の一覧と同じ条件） */
async function listTransactions(query: ExpenseListQuery) {
  const page = await listMoney(query);
  return {
    ...page,
    items: page.items.flatMap((entry) => (entry.type === 'transaction' ? [entry.transaction] : [])),
  };
}

const HEADER =
  '"計算対象","日付","内容","金額（円）","保有金融機関","大項目","中項目","メモ","振替","ID"';

/** CSV の 1 行。[日付, 内容, 金額, 金融機関, 大項目, 中項目, ID] */
function csv(rows: [string, string, string, string, string, string, string][]): string {
  return [
    HEADER,
    ...rows.map(([date, description, amount, account, major, minor, id]) =>
      ['1', date, description, amount, account, major, minor, '', '0', id]
        .map((v) => `"${v}"`)
        .join(','),
    ),
  ].join('\r\n');
}

const NOW = new Date('2026-10-06T09:00:00+09:00');
const ACCOUNTS = ['テスト銀行', 'テスト証券', 'テストカード'];

/** ブラウザで Money Forward を開く所だけを差し替える（取り込んだ後の読み書きは本物の DB で確かめる） */
function serve(csvs: string[]) {
  return vi.spyOn(moneyforward, 'scrapeMoneyForward').mockResolvedValue({
    csvs,
    accounts: [
      { name: 'テスト銀行', balance: 1_234_567, withdrawalAmount: null, withdrawalOn: null },
      { name: 'テスト証券', balance: 890_000, withdrawalAmount: null, withdrawalOn: null },
      {
        name: 'テストカード',
        balance: -42_000,
        withdrawalAmount: 42_000,
        withdrawalOn: dateStringSchema.parse('2026-10-27'),
      },
    ],
  });
}

describe('money service', () => {
  beforeEach(clearTables);
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('CSV を明細にし、取り込む口座の明細だけを残す', () => {
    const rows = parseTransactionsCsv(
      csv([
        ['2026/09/24', 'スーパー', '-3,200', 'テストカード', '食費', '食料品', 'a1'],
        ['2026/09/25', '給与', '300000', 'テスト銀行 普通', '収入', '未分類', 'a2'],
        ['2026/09/25', 'ほかの口座', '-100', 'よその銀行', '未分類', '未分類', 'a3'],
      ]),
      ACCOUNTS,
    );
    expect(rows).toEqual([
      {
        sourceId: 'a1',
        account: 'テストカード',
        occurredOn: '2026-09-24',
        description: 'スーパー',
        amount: -3200,
        category: '食費 / 食料品',
      },
      {
        sourceId: 'a2',
        account: 'テスト銀行',
        occurredOn: '2026-09-25',
        description: '給与',
        amount: 300000,
        category: '収入',
      },
    ]);
  });

  it('形の合わない CSV は飛ばさずに投げる', () => {
    expect(() =>
      parseTransactionsCsv(
        csv([['9月24日', 'スーパー', '-3200', 'テストカード', '食費', '食料品', 'a1']]),
        ACCOUNTS,
      ),
    ).toThrow('2 行目');
    expect(() => parseTransactionsCsv('<html></html>\n<body>', ACCOUNTS)).toThrow();
  });

  it('画面の文字から金額・引き落とし・口座を読む', () => {
    expect(parseYen('▲1,200円')).toBe(-1200);
    expect(parseYen('-')).toBeNull();
    expect(parseWithdrawalAmount(['カード', '引き落とし予定額：42,000円'])).toBe(42000);
    expect(parseWithdrawalAmount(['引き落とし予定額：未定'])).toBeNull();
    expect(parseWithdrawalDate('引き落とし日:(2026/10/27)')).toBe('2026-10-27');
    expect(matchAccount('楽天カード（家族）', ['楽天カード', '楽天カード（家族）'])).toBe(
      '楽天カード（家族）',
    );
  });

  it('取り込むと、口座を環境変数の順に、カードは引き落としとともに返す', async () => {
    expect((await listAccounts()).map((a) => [a.name, a.balance, a.fetchedAt])).toEqual([
      ['テスト銀行', null, null],
      ['テスト証券', null, null],
      ['テストカード', null, null],
    ]);
    const scrape = serve([csv([])]);
    expect(await syncMoneyForward(NOW)).toEqual({ transactions: 0, accounts: 3 });
    // 先月と今月の 2 か月を読む
    expect(scrape.mock.calls[0]?.[2]).toEqual(['2026-09', '2026-10']);
    expect(await listAccounts()).toMatchObject([
      { name: 'テスト銀行', kind: 'bank', balance: 1_234_567 },
      { name: 'テスト証券', kind: 'securities', balance: 890_000 },
      { name: 'テストカード', kind: 'card', withdrawalAmount: 42_000, withdrawalOn: '2026-10-27' },
    ]);
  });

  it('取り込み直すと明細を上書きし、Money Forward で消えた明細を消し、読んだ範囲の外は残す', async () => {
    serve([
      csv([
        ['2026/09/01', '古い明細', '-100', 'テスト銀行', '未分類', '未分類', 'old'],
        ['2026/09/24', 'スーパー', '-3200', 'テストカード', '食費', '食料品', 'a1'],
      ]),
      csv([['2026/10/01', '消える明細', '-500', 'テストカード', '食費', '食料品', 'gone']]),
    ]);
    await syncMoneyForward(NOW);
    serve([
      csv([['2026/09/24', 'スーパー（直した）', '-3300', 'テストカード', '食費', '食料品', 'a1']]),
      csv([['2026/10/02', '新しい明細', '-700', 'テストカード', '食費', '外食', 'new']]),
    ]);
    expect(await syncMoneyForward(NOW)).toEqual({ transactions: 2, accounts: 3 });

    const page = await listTransactions({});
    expect(page.items.map((t) => [t.occurredOn, t.description, t.amount])).toEqual([
      // 読んだ明細（9/24〜10/2）より前の明細は、Money Forward の月の区切りが分からないので消さない
      ['2026-09-01', '古い明細', -100],
      ['2026-09-24', 'スーパー（直した）', -3300],
      ['2026-10-02', '新しい明細', -700],
    ]);
    // 分類でも絞り込める
    expect(await listTransactions({ q: '外食' })).toMatchObject({
      items: [{ description: '新しい明細', category: '食費 / 外食' }],
    });
  });

  it('入出金はタイムラインにその日の始まりで並び、キーワードで絞れる', async () => {
    serve([csv([['2026/10/02', 'スーパー', '-3200', 'テストカード', '食費', '食料品', 'a1']])]);
    await syncMoneyForward(NOW);
    const { items } = await getTimelinePage({ q: 'スーパー' }, NOW);
    expect(items).toMatchObject([
      {
        type: 'transaction',
        at: new Date('2026-10-02T00:00:00+09:00').toISOString(),
        dateOnly: true,
        transaction: { account: 'テストカード', amount: -3200 },
      },
    ]);
  });

  it('環境変数から外した口座の行と明細は、次の取り込みで消す', async () => {
    serve([csv([['2026/10/02', 'スーパー', '-3200', 'テストカード', '食費', '食料品', 'a1']])]);
    await syncMoneyForward(NOW);
    // 外した口座の行を、前の取り込みで残った物として置いておく
    await db.insert(moneyAccounts).values({ name: '外した銀行', balance: 1, fetchedAt: NOW });
    await db.insert(moneyTransactions).values({
      id: newId(),
      sourceId: 'removed',
      account: '外した銀行',
      occurredOn: dateStringSchema.parse('2026-01-01'),
      description: '外した口座の明細',
      amount: -1,
    });
    await syncMoneyForward(NOW);
    expect((await db.select().from(moneyAccounts)).map((row) => row.name)).not.toContain(
      '外した銀行',
    );
    expect((await listTransactions({})).items.map((t) => t.description)).toEqual(['スーパー']);
  });

  it('Money Forward が読めなければ投げ、前回の値を残す', async () => {
    serve([csv([['2026/10/02', 'スーパー', '-3200', 'テストカード', '食費', '食料品', 'a1']])]);
    await syncMoneyForward(NOW);
    vi.spyOn(moneyforward, 'scrapeMoneyForward').mockRejectedValue(
      new Error('moneyforward: ログインできませんでした'),
    );
    await expect(syncMoneyForward(NOW)).rejects.toThrow('ログイン');
    expect((await listTransactions({})).items).toHaveLength(1);
    expect((await listAccounts())[0]?.balance).toBe(1_234_567);
  });
});
