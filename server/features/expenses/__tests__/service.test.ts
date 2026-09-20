import { beforeEach, describe, expect, it } from 'vitest';
import { dateStringSchema } from '../../../../shared/validation/common.ts';
import { truncateAll } from '../../../lib/test-db.ts';
import { createUser } from '../../users/service.ts';
import { addExpense, deleteExpense, getBalance, listExpenses } from '../service.ts';

let a: string;
let b: string;

const on = dateStringSchema.parse('2026-09-01');

describe('expenses service', () => {
  beforeEach(async () => {
    await truncateAll();
    a = (await createUser({ email: 'a@example.com', name: 'A', password: 'password-123456' })).id;
    b = (await createUser({ email: 'b@example.com', name: 'B', password: 'password-123456' })).id;
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

  it('立替を削除できる', async () => {
    const expense = await addExpense(
      { fromUserId: a, toUserId: null, amount: 2000, description: '食材', spentOn: on },
      a,
    );
    await deleteExpense(expense.id);
    expect(await listExpenses()).toHaveLength(0);
  });
});
