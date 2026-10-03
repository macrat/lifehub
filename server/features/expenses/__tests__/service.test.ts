import { beforeEach, describe, expect, it } from 'vitest';
import { addDays } from '../../../../shared/date.ts';
import { newId } from '../../../../shared/id.ts';
import { dateStringSchema } from '../../../../shared/validation/common.ts';
import {
  type ExpenseInput,
  type ExpenseListQuery,
  SHARED,
} from '../../../../shared/validation/expenses.ts';
import { resetUsers } from '../../../lib/db/test-db.ts';
import {
  addExpense,
  deleteExpense,
  getSettlements,
  listExpenses,
  updateExpense,
} from '../service.ts';

let a: string;
let b: string;

const on = dateStringSchema.parse('2026-09-01');

describe('expenses service', () => {
  beforeEach(async () => {
    ({ userId: a, partnerId: b } = await resetUsers());
  });

  it('立替が無ければ精算済み（移動なし）', async () => {
    expect(await getSettlements()).toEqual([]);
  });

  it('共有のために払うと共有の債務、共有から引き出すと引き出した人の債務になる', async () => {
    await addExpense(
      { fromUserId: a, toUserId: null, amount: 3000, description: '旅行', spentOn: on },
      a,
    );
    expect(await getSettlements()).toEqual([{ creditorId: a, debtorId: null, amount: 3000 }]);

    await addExpense(
      { fromUserId: null, toUserId: b, amount: 1000, description: '引き出し', spentOn: on },
      b,
    );
    // 共有から B へ渡った 1000 は、共有を経由せず B から A へ直接返せば済む
    expect(await getSettlements()).toEqual([
      { creditorId: a, debtorId: null, amount: 2000 },
      { creditorId: a, debtorId: b, amount: 1000 },
    ]);
  });

  it('精算は「払った人 → 受け取った人」の行として記録し、移動が無くなる', async () => {
    await addExpense(
      { fromUserId: b, toUserId: a, amount: 2000, description: 'A の分', spentOn: on },
      b,
    );
    expect(await getSettlements()).toEqual([{ creditorId: b, debtorId: a, amount: 2000 }]);
    await addExpense(
      { fromUserId: a, toUserId: b, amount: 2000, description: '精算', spentOn: on },
      a,
    );
    expect(await getSettlements()).toEqual([]);
  });

  it('From と To に同じ相手（共有から共有を含む）は選べない', async () => {
    await expect(
      addExpense(
        { fromUserId: null, toUserId: null, amount: 100, description: '移し替え', spentOn: on },
        a,
      ),
    ).rejects.toThrow('From と To に同じ相手は選べません');
  });

  it('立替を編集すると全項目が置き換わり、精算に反映される', async () => {
    const expense = await addExpense(
      { fromUserId: a, toUserId: null, amount: 2000, description: '食材', spentOn: on },
      a,
    );
    await updateExpense(
      expense.id,
      {
        fromUserId: b,
        toUserId: a,
        amount: 500,
        description: 'A の分',
        spentOn: dateStringSchema.parse('2026-09-02'),
      },
      a,
    );
    expect((await listExpenses({})).items).toMatchObject([
      {
        id: expense.id,
        fromUserId: b,
        toUserId: a,
        amount: 500,
        description: 'A の分',
        spentOn: '2026-09-02',
      },
    ]);
    expect(await getSettlements()).toEqual([{ creditorId: b, debtorId: a, amount: 500 }]);
  });

  it('同じ id で送り直しても二重に記録されない（オフラインで溜めた書き込みの再送）', async () => {
    const id = newId();
    const input = { fromUserId: a, toUserId: null, amount: 2000, description: '食材', spentOn: on };
    await addExpense(input, a, id);
    await addExpense(input, a, id);

    expect((await listExpenses({})).items).toHaveLength(1);
    expect(await getSettlements()).toEqual([{ creditorId: a, debtorId: null, amount: 2000 }]);
  });

  it('編集した後に古い作成が送り直されても、編集は巻き戻らない', async () => {
    const id = newId();
    const input = { fromUserId: a, toUserId: null, amount: 2000, description: '食材', spentOn: on };
    await addExpense(input, a, id);
    await updateExpense(id, { ...input, amount: 3000 }, a);
    const resent = await addExpense(input, b, id);

    expect(resent).toMatchObject({ amount: 3000 });
    expect((await listExpenses({})).items).toMatchObject([{ id, amount: 3000 }]);
  });

  it('立替を削除できる', async () => {
    const expense = await addExpense(
      { fromUserId: a, toUserId: null, amount: 2000, description: '食材', spentOn: on },
      a,
    );
    await deleteExpense(expense.id, a);
    expect((await listExpenses({})).items).toHaveLength(0);
  });

  describe('履歴のページ', () => {
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
      for (const spentOn of days) await add({ spentOn });
      const first = await listExpenses({});
      expect(first.items.map((e) => e.spentOn)).toEqual(days.slice(10));
      expect(first.nextCursor).toBe(days[10]);

      const second = await listExpenses({ before: days[10] });
      expect(second.items.map((e) => e.spentOn)).toEqual(days.slice(0, 10));
      expect(second.nextCursor).toBeNull();
    });

    it('日の途中では切らず、その日の立替はすべて同じページに入れる', async () => {
      for (let n = 0; n < 49; n++) await add({ spentOn: day(20) });
      // 50 件目の日（1/10）には 3 件あり、3 件ともこのページに入る
      for (let n = 0; n < 3; n++) await add({ spentOn: day(10) });
      await add({ spentOn: day(1) });

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
      for (const spentOn of days) {
        await add({ spentOn, description: '食材' });
        await add({ spentOn, description: '日用品' });
      }
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
      const names = async (q: string) =>
        (await listExpenses({ q })).items.map((e) => e.description);
      expect(await names('milk')).toEqual(['スーパーで Milk']);
      expect(await names('%')).toEqual(['100% ジュース']);
      expect(await names('_')).toEqual([]);
    });
  });
});
