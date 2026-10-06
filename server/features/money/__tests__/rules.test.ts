import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newId } from '../../../../shared/id.ts';
import { dateStringSchema } from '../../../../shared/validation/common.ts';
import { type ExpenseListQuery, SHARED } from '../../../../shared/validation/expenses.ts';
import { type MoneyRule, moneyRulesSchema } from '../../../../shared/validation/money.ts';
import { db } from '../../../lib/db/client.ts';
import { resetUsers } from '../../../lib/db/test-db.ts';
import { getSettlements, listMoneyEntries } from '../../expenses/service.ts';
import { getTimelinePage } from '../../timeline/service.ts';
import * as moneyforward from '../moneyforward.ts';
import { applyRules } from '../rules.ts';
import { moneyTransactions } from '../schema.ts';
import { listRules, saveRules, syncMoneyForward } from '../service.ts';

/**
 * 入出金の読み替えのルール: 当て方（`applyRules`）、保存したら過去の入出金にも効くこと、取り込みに効くこと、
 * 「共有」との立替として精算・絞り込み・タイムラインに入ること。
 */

let a: string;
let b: string;

const rule = (values: Partial<MoneyRule> & Pick<MoneyRule, 'pattern'>): MoneyRule => ({
  id: newId(),
  replaceDescription: false,
  replacement: '',
  kind: 'spending',
  userId: null,
  ...values,
});

/** 取り込み済みの入出金を 1 件入れる（読み替える前のまま） */
async function addTransaction(
  originalDescription: string,
  amount: number,
  occurredOn = '2026-10-01',
) {
  await db.insert(moneyTransactions).values({
    id: newId(),
    sourceId: newId(),
    account: 'テスト銀行',
    occurredOn: dateStringSchema.parse(occurredOn),
    originalDescription,
    description: originalDescription,
    amount,
  });
}

/** 一覧の入出金（内容欄と当事者） */
async function transactions(query: ExpenseListQuery = {}) {
  return (await listMoneyEntries(query)).items.flatMap((entry) =>
    entry.type === 'transaction'
      ? [[entry.transaction.description, entry.transaction.parties]]
      : [],
  );
}

describe('ルールの当て方', () => {
  it('上から順に見て最初に当たったルールだけを使い、どれにも当たらなければ元のまま', () => {
    const rules = [
      rule({ pattern: 'AMAZON.*', replaceDescription: true, replacement: 'アマゾン' }),
      rule({ pattern: 'AMAZON PRIME.*', replaceDescription: true, replacement: 'プライム' }),
    ];
    expect(applyRules(rules, 'AMAZON PRIME 会費')).toEqual({
      description: 'アマゾン',
      direction: null,
      userId: null,
    });
    expect(applyRules(rules, 'スーパー')).toEqual({
      description: 'スーパー',
      direction: null,
      userId: null,
    });
  });

  it('パターンは内容欄全体と一致したときだけ当たり、選択（|）も全体に掛かる', () => {
    const matches = (pattern: string, original: string) =>
      applyRules([rule({ pattern, kind: 'deposit', userId: 'u1' })], original).direction !== null;
    expect(matches('振込', '振込')).toBe(true);
    expect(matches('振込', '振込 タロウ')).toBe(false);
    expect(matches('振込', 'ネット振込')).toBe(false);
    expect(matches('振込.*', '振込 タロウ')).toBe(true);
    expect(matches('a|b', 'ab')).toBe(false);
    expect(matches('a|b', 'b')).toBe(true);
    // ^ や $ を書いても同じ
    expect(matches('^振込$', '振込')).toBe(true);
  });

  it('置換後の内容欄にキャプチャ・名前付きキャプチャ・当たった所・$ を差し込める', () => {
    const replaced = (pattern: string, replacement: string, original: string) =>
      applyRules([rule({ pattern, replaceDescription: true, replacement })], original).description;
    expect(replaced('振込 (\\S+) 様', '$1 から振込', '振込 ヤマダタロウ 様')).toBe(
      'ヤマダタロウ から振込',
    );
    expect(replaced('振込 (?<name>\\S+)', '$<name> さん', '振込 ハナコ')).toBe('ハナコ さん');
    expect(replaced('カード \\d+', '[$&] $$', 'カード 1234')).toBe('[カード 1234] $');
    // 無いキャプチャは空にする
    expect(replaced('(a)|(b)', '$2', 'a')).toBe('');
  });

  it('置換しないルールは内容欄を変えずに、入金・出金を対象者との立替にする', () => {
    expect(
      applyRules([rule({ pattern: '振込 .*', kind: 'deposit', userId: 'u1' })], '振込 タロウ'),
    ).toEqual({
      description: '振込 タロウ',
      direction: 'deposit',
      userId: 'u1',
    });
  });

  it('正しくないルールは保存の入力として受け付けない', () => {
    const parse = (values: Partial<MoneyRule>) =>
      moneyRulesSchema.safeParse([rule({ pattern: 'x', ...values })]).error?.issues[0]?.message;
    expect(parse({ pattern: '(' })).toBe('正規表現として読めません');
    expect(parse({ replaceDescription: true, replacement: '' })).toBe(
      '置換後の内容欄を入力してください',
    );
    expect(parse({ kind: 'withdrawal', userId: null })).toBe('対象者を選んでください');
    // 支出なら対象者は持たない
    expect(
      moneyRulesSchema.parse([rule({ pattern: 'x', kind: 'spending', userId: newId() })])[0]
        ?.userId,
    ).toBeNull();
  });
});

describe('ルールの保存', () => {
  beforeEach(async () => {
    ({ userId: a, partnerId: b } = await resetUsers());
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('足す・直す・消すと、取り込み済みの入出金を元の内容欄から読み替え直す', async () => {
    await addTransaction('振込 タロウ', 50_000);
    const deposit = rule({
      pattern: '振込 (\\S+)',
      replaceDescription: true,
      replacement: '$1 の入金',
      kind: 'deposit',
      userId: a,
    });
    await saveRules([deposit], a);
    expect(await transactions()).toEqual([['タロウ の入金', { fromUserId: a, toUserId: null }]]);
    expect(await listRules()).toEqual([deposit]);

    // 直すと、読み替えた後ではなく元の内容欄から当て直す
    await saveRules([{ ...deposit, replacement: '$1 さん', kind: 'withdrawal', userId: b }], a);
    expect(await transactions()).toEqual([['タロウ さん', { fromUserId: null, toUserId: b }]]);

    // 消すと元に戻る
    await saveRules([], a);
    expect(await transactions()).toEqual([['振込 タロウ', null]]);
    expect(await listRules()).toEqual([]);
  });

  it('取り込むときも今のルールで読み替え、元の内容欄は残す', async () => {
    await saveRules(
      [
        rule({
          pattern: 'ATM.*',
          replaceDescription: true,
          replacement: 'ATM 引き出し',
          kind: 'withdrawal',
          userId: b,
        }),
      ],
      a,
    );
    vi.spyOn(moneyforward, 'scrapeMoneyForward').mockResolvedValue({
      csvs: [
        [
          '"計算対象","日付","内容","金額（円）","保有金融機関","大項目","中項目","メモ","振替","ID"',
          '"1","2026/10/02","ATM 0123","-20000","テスト銀行","現金","ATM","","0","x1"',
        ].join('\r\n'),
      ],
      transfers: [],
      accounts: [{ name: 'テスト銀行', balance: 0, withdrawalAmount: null, withdrawalOn: null }],
    });
    await syncMoneyForward(new Date('2026-10-06T09:00:00+09:00'));
    expect(await transactions()).toEqual([['ATM 引き出し', { fromUserId: null, toUserId: b }]]);
    const [row] = await db.select().from(moneyTransactions);
    expect(row?.originalDescription).toBe('ATM 0123');
  });

  it('入金・出金は「共有」との立替として精算に入り、To・From で絞り込める', async () => {
    await addTransaction('振込', 30_000);
    await addTransaction('ATM', -10_000);
    await addTransaction('スーパー', -3_000);
    await saveRules(
      [
        rule({ pattern: '振込', kind: 'deposit', userId: a }),
        rule({ pattern: 'ATM', kind: 'withdrawal', userId: b }),
      ],
      a,
    );
    // A が共有へ 30,000 円入れ、B が共有から 10,000 円引き出した。共有は A に 30,000 円の債務、B に 10,000 円の債権
    expect(await getSettlements()).toEqual([
      { creditorId: a, debtorId: null, amount: 20_000 },
      { creditorId: a, debtorId: b, amount: 10_000 },
    ]);
    const names = async (query: ExpenseListQuery) =>
      (await transactions(query)).map(([description]) => description);
    expect(await names({ to: SHARED })).toEqual(['振込']);
    expect(await names({ from: SHARED })).toEqual(['ATM']);
    expect(await names({ from: a })).toEqual(['振込']);
    expect(await names({ to: b })).toEqual(['ATM']);
    expect(await names({ to: a })).toEqual([]);
    // ただの支出は当事者を持たない
    expect(await names({})).toEqual(['振込', 'ATM', 'スーパー']);

    // タイムラインの行も当事者を持つ（色に使う）
    const { items } = await getTimelinePage({ q: '振込' }, new Date('2026-10-06T09:00:00+09:00'));
    expect(items).toMatchObject([
      { type: 'transaction', transaction: { parties: { fromUserId: a, toUserId: null } } },
    ]);
  });
});
