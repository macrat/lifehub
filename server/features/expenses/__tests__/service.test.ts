import { beforeEach, describe, expect, it } from 'vitest';
import { addDays } from '../../../../shared/date.ts';
import { newId } from '../../../../shared/id.ts';
import { dateStringSchema } from '../../../../shared/validation/common.ts';
import {
  type ExpenseInput,
  type ExpenseListQuery,
  SHARED,
} from '../../../../shared/validation/expenses.ts';
import { createTestUser, truncateAll } from '../../../lib/test-db.ts';
import { addExpense, deleteExpense, getBalance, listExpenses, updateExpense } from '../service.ts';

let a: string;
let b: string;

const on = dateStringSchema.parse('2026-09-01');

describe('expenses service', () => {
  beforeEach(async () => {
    await truncateAll();
    a = await createTestUser('A');
    b = await createTestUser('B');
  });

  it('立替が無ければ精算済み', async () => {
    expect(await getBalance()).toEqual({ amount: 0, fromUserId: null, toUserId: null });
  });

  it('共有（To なし）は折半で残高を計算し、端数は切り捨てる', async () => {
    await addExpense(
      { fromUserId: a, toUserId: null, amount: 3001, description: '食材', spentOn: on },
      a,
    );
    await addExpense(
      { fromUserId: b, toUserId: null, amount: 1000, description: '日用品', spentOn: on },
      b,
    );
    // (3001 - 1000) / 2 = 1000.5 → 1000。B が A に払う
    expect(await getBalance()).toEqual({ amount: 1000, fromUserId: b, toUserId: a });
  });

  it('To にユーザーを指定すると全額がそのユーザーの負担になる', async () => {
    await addExpense(
      { fromUserId: a, toUserId: b, amount: 2000, description: 'B の分', spentOn: on },
      a,
    );
    expect(await getBalance()).toEqual({ amount: 2000, fromUserId: b, toUserId: a });
  });

  it('精算は「払った人 → 受け取った人」の行として記録し、残高がゼロに戻る', async () => {
    await addExpense(
      { fromUserId: a, toUserId: null, amount: 2000, description: '食材', spentOn: on },
      a,
    );
    expect(await getBalance()).toEqual({ amount: 1000, fromUserId: b, toUserId: a });
    await addExpense(
      { fromUserId: b, toUserId: a, amount: 1000, description: '精算', spentOn: on },
      b,
    );
    expect(await getBalance()).toEqual({ amount: 0, fromUserId: null, toUserId: null });

    await addExpense(
      { fromUserId: b, toUserId: null, amount: 500, description: 'コーヒー', spentOn: on },
      b,
    );
    expect(await getBalance()).toEqual({ amount: 250, fromUserId: a, toUserId: b });
  });

  it('立替を編集すると全項目が置き換わり、残高に反映される', async () => {
    const expense = await addExpense(
      { fromUserId: a, toUserId: null, amount: 2000, description: '食材', spentOn: on },
      a,
    );
    const updated = await updateExpense(expense.id, {
      fromUserId: b,
      toUserId: a,
      amount: 500,
      description: 'A の分',
      spentOn: dateStringSchema.parse('2026-09-02'),
    });
    expect(updated).toMatchObject({
      id: expense.id,
      fromUserId: b,
      toUserId: a,
      amount: 500,
      description: 'A の分',
      spentOn: '2026-09-02',
    });
    expect(await getBalance()).toEqual({ amount: 500, fromUserId: a, toUserId: b });
  });

  it('同じ id で送り直しても二重に記録されない（オフラインで溜めた書き込みの再送）', async () => {
    const id = newId();
    const input = { fromUserId: a, toUserId: null, amount: 2000, description: '食材', spentOn: on };
    await addExpense(input, a, id);
    await addExpense(input, a, id);

    expect((await listExpenses({})).items).toHaveLength(1);
    expect(await getBalance()).toEqual({ amount: 1000, fromUserId: b, toUserId: a });
  });

  it('編集した後に古い作成が送り直されても、編集は巻き戻らない', async () => {
    const id = newId();
    const input = { fromUserId: a, toUserId: null, amount: 2000, description: '食材', spentOn: on };
    await addExpense(input, a, id);
    await updateExpense(id, { ...input, amount: 3000 });
    const resent = await addExpense(input, b, id);

    expect(resent).toMatchObject({ amount: 3000 });
    expect((await listExpenses({})).items).toMatchObject([{ id, amount: 3000 }]);
  });

  it('立替を削除できる', async () => {
    const expense = await addExpense(
      { fromUserId: a, toUserId: null, amount: 2000, description: '食材', spentOn: on },
      a,
    );
    await deleteExpense(expense.id);
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

    it('To は共有とユーザーを選び分け、From は払った人で絞り込む', async () => {
      await add({ description: '共有' });
      await add({ description: 'B の分', toUserId: b });
      await add({ description: 'B が払った', fromUserId: b });
      const names = async (query: ExpenseListQuery) =>
        (await listExpenses(query)).items.map((e) => e.description);
      expect(await names({ to: SHARED })).toEqual(['共有', 'B が払った']);
      expect(await names({ to: b })).toEqual(['B の分']);
      expect(await names({ from: b })).toEqual(['B が払った']);
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
