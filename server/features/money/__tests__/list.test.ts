import { beforeEach, describe, expect, it } from 'vitest';
import { addDays } from '../../../../shared/date.ts';
import type { Expense } from '../../../../shared/expenses.ts';
import { newId } from '../../../../shared/id.ts';
import { dateStringSchema } from '../../../../shared/validation/common.ts';
import {
  type ExpenseInput,
  type ExpenseListQuery,
  SHARED,
} from '../../../../shared/validation/expenses.ts';
import { db } from '../../../lib/db/client.ts';
import { resetUsers } from '../../../lib/db/test-db.ts';
import { addExpense } from '../../expenses/service.ts';
import { moneyTransactions } from '../schema.ts';
import { listMoney } from '../service.ts';

/**
 * お金の画面の一覧（`listMoney`）: 立替と取り込んだ入出金を 1 本に並べたページと、立替の一覧と同じ絞り込み。
 * 立替だけの場合は、立替だけの一覧だったときと同じページ・同じ絞り込みになることを確かめる。
 */

let a: string;
let b: string;

const on = dateStringSchema.parse('2026-09-01');

/** 一覧の 1 ページから立替だけ */
async function listExpenses(query: ExpenseListQuery) {
  const page = await listMoney(query);
  return {
    ...page,
    items: page.items.flatMap((entry): Expense[] =>
      entry.type === 'expense' ? [entry.expense] : [],
    ),
  };
}

/** 取り込んだ入出金を 1 件入れる（取り込みそのものは service.test.ts で確かめる） */
async function addTransaction(occurredOn: string, description: string, amount: number) {
  await db.insert(moneyTransactions).values({
    id: newId(),
    sourceId: newId(),
    account: 'テストカード',
    occurredOn: dateStringSchema.parse(occurredOn),
    description,
    amount,
  });
}

beforeEach(async () => {
  ({ userId: a, partnerId: b } = await resetUsers());
});

describe('立替だけのページと絞り込み（立替だけの一覧だったときと同じ）', () => {
  const day = (n: number) => dateStringSchema.parse(`2026-01-${String(n).padStart(2, '0')}`);
  const add = (values: Partial<ExpenseInput> = {}) =>
    addExpense(
      {
        fromUserId: a,
        toUserId: null,
        amount: 1000,
        description: '買い物',
        spentOn: on,
        ...values,
      },
      a,
    );

  it('新しいほうから 1 ページを古い順で返し、nextCursor で前のページへ続く', async () => {
    // 1 日 1 件を 60 日。1 ページ（50 件）に収まらない
    const days = Array.from({ length: 60 }, (_, i) => addDays(day(1), i));
    await Promise.all(days.map((spentOn) => add({ spentOn })));
    const first = await listExpenses({});
    expect(first.items.map((e) => e.spentOn)).toEqual(days.slice(10));
    expect(first.nextCursor).toBe(days[10]);

    const second = await listExpenses({ before: days[10] });
    expect(second.items.map((e) => e.spentOn)).toEqual(days.slice(0, 10));
    expect(second.nextCursor).toBeNull();
  });

  it('日の途中では切らず、その日の立替はすべて同じページに入れる', async () => {
    // 50 件目の日（1/10）には 3 件あり、3 件ともこのページに入る
    const spentOns = [...Array(49).fill(day(20)), ...Array(3).fill(day(10)), day(1)];
    await Promise.all(spentOns.map((spentOn) => add({ spentOn })));

    const first = await listExpenses({});
    expect(first.items).toHaveLength(52);
    expect(first.nextCursor).toBe('2026-01-10');
    const second = await listExpenses({ before: day(10) });
    expect(second.items.map((e) => e.spentOn)).toEqual(['2026-01-01']);
    expect(second.nextCursor).toBeNull();
  });

  it('絞り込んでいても、ページに入るのは条件に合う立替だけ', async () => {
    // 条件に合う立替が 1 ページ（50 件）を超え、ページの範囲の日には合わない立替も混ざる
    const days = Array.from({ length: 60 }, (_, i) => addDays(day(1), i));
    await Promise.all(
      days.flatMap((spentOn) => [
        add({ spentOn, description: '食材' }),
        add({ spentOn, description: '日用品' }),
      ]),
    );
    const first = await listExpenses({ q: '食材' });
    expect(first.items).toHaveLength(50);
    expect(first.items.every((e) => e.description === '食材')).toBe(true);
    expect(first.nextCursor).toBe(days[10]);
    const second = await listExpenses({ q: '食材', before: days[10] });
    expect(second.items).toHaveLength(10);
    expect(second.nextCursor).toBeNull();
  });

  it('金額・日付の範囲は両端を含み、片方だけでも絞り込める', async () => {
    await add({ amount: 999, spentOn: day(1) });
    await add({ amount: 1000, spentOn: day(2) });
    await add({ amount: 1001, spentOn: day(3) });
    const amounts = async (query: ExpenseListQuery) =>
      (await listExpenses(query)).items.map((e) => e.amount);
    expect(await amounts({ min: 1000 })).toEqual([1000, 1001]);
    expect(await amounts({ max: 1000 })).toEqual([999, 1000]);
    expect(await amounts({ since: day(2), until: day(3) })).toEqual([1000, 1001]);
  });

  it('To・From は共有とユーザーを選び分けて絞り込む', async () => {
    await add({ description: '共有' });
    await add({ description: 'B の分', toUserId: b });
    await add({ description: 'B が払った', fromUserId: b });
    await add({ description: '引き出し', fromUserId: null, toUserId: b });
    const names = async (query: ExpenseListQuery) =>
      (await listExpenses(query)).items.map((e) => e.description);
    expect(await names({ to: SHARED })).toEqual(['共有', 'B が払った']);
    expect(await names({ to: b })).toEqual(['B の分', '引き出し']);
    expect(await names({ from: b })).toEqual(['B が払った']);
    expect(await names({ from: SHARED })).toEqual(['引き出し']);
  });

  it('キーワードは内容の部分一致で、大文字小文字と % _ をそのまま扱う', async () => {
    await add({ description: 'スーパーで Milk' });
    await add({ description: '100% ジュース' });
    await add({ description: 'コンビニ' });
    const names = async (q: string) => (await listExpenses({ q })).items.map((e) => e.description);
    expect(await names('milk')).toEqual(['スーパーで Milk']);
    expect(await names('%')).toEqual(['100% ジュース']);
    expect(await names('_')).toEqual([]);
  });
});

describe('立替と入出金を 1 本に並べる', () => {
  const add = (spentOn: string, description: string) =>
    addExpense(
      {
        fromUserId: a,
        toUserId: null,
        amount: 1000,
        description,
        spentOn: dateStringSchema.parse(spentOn),
      },
      a,
    );
  const labels = async (query: ExpenseListQuery = {}) =>
    (await listMoney(query)).items.map((entry) =>
      entry.type === 'expense' ? entry.expense.description : entry.transaction.description,
    );

  it('日の古い順に並べ、同じ日の中は入出金を立替より前（画面では下）に置く', async () => {
    await add('2026-09-02', '立替 2 日');
    await addTransaction('2026-09-02', '入出金 2 日', -500);
    await addTransaction('2026-09-01', '入出金 1 日', 300000);
    expect(await labels()).toEqual(['入出金 1 日', '入出金 2 日', '立替 2 日']);
  });

  it('ページは立替と入出金を合わせて数え、日の途中では切らない', async () => {
    // 立替 30 日分と入出金 30 日分（日は交互）。合わせて 60 件で、1 ページ（50 件）に収まらない
    const days = Array.from({ length: 60 }, (_, i) =>
      addDays(dateStringSchema.parse('2026-01-01'), i),
    );
    await Promise.all(
      days.map((day, i) =>
        i % 2 === 0 ? add(day, `立替 ${i}`) : addTransaction(day, `入出金 ${i}`, -1),
      ),
    );
    const first = await listMoney({});
    expect(first.items).toHaveLength(50);
    expect(first.nextCursor).toBe(days[10]);
    const second = await listMoney({ before: days[10] });
    expect(second.items).toHaveLength(10);
    expect(second.nextCursor).toBeNull();
  });

  it('立替の絞り込みを入出金に読み替える（金額は額の大きさ、To・From で絞れば出さない）', async () => {
    await addTransaction('2026-09-01', 'スーパー', -3200);
    await addTransaction('2026-09-02', '給与', 300000);
    await addTransaction('2026-09-03', 'コンビニ', -500);
    expect(await labels({ min: 1000, max: 5000 })).toEqual(['スーパー']);
    expect(await labels({ since: dateStringSchema.parse('2026-09-02') })).toEqual([
      '給与',
      'コンビニ',
    ]);
    expect(await labels({ q: 'コンビ' })).toEqual(['コンビニ']);
    expect(await labels({ to: SHARED })).toEqual([]);
    expect(await labels({ from: a })).toEqual([]);
  });
});
