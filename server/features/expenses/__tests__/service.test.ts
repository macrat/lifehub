import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError } from '../../../lib/errors.ts';
import { truncateAll } from '../../../lib/test-db.ts';
import { createUser } from '../../users/service.ts';
import { addExpense, deleteExpense, getBalance, listHistory, settle } from '../service.ts';

let a: string;
let b: string;

describe('expenses service', () => {
  beforeEach(async () => {
    await truncateAll();
    a = (await createUser({ email: 'a@example.com', name: 'A', password: 'password-123456' })).id;
    b = (await createUser({ email: 'b@example.com', name: 'B', password: 'password-123456' })).id;
  });

  it('立替が無ければ精算済み', async () => {
    expect(await getBalance()).toEqual({ amount: 0, fromUserId: null, toUserId: null });
    await expect(settle(a)).rejects.toBeInstanceOf(ConflictError);
  });

  it('常に折半で残高を計算し、端数は切り捨てる', async () => {
    await addExpense({ paidBy: a, amount: 3001, description: '食材', spentOn: '2026-09-01' }, a);
    await addExpense({ paidBy: b, amount: 1000, description: '日用品', spentOn: '2026-09-02' }, b);
    // (3001 - 1000) / 2 = 1000.5 → 1000。B が A に払う
    expect(await getBalance()).toEqual({ amount: 1000, fromUserId: b, toUserId: a });
  });

  it('精算で残高がゼロに戻り、その後の立替は新たに積み上がる', async () => {
    await addExpense({ paidBy: a, amount: 2000, description: '食材', spentOn: '2026-09-01' }, a);
    const settlement = await settle(a, new Date('2026-09-10T03:00:00Z'));
    expect(settlement).toMatchObject({
      fromUser: b,
      toUser: a,
      amount: 1000,
      settledOn: '2026-09-10',
    });
    expect(await getBalance()).toEqual({ amount: 0, fromUserId: null, toUserId: null });

    await addExpense({ paidBy: b, amount: 500, description: 'コーヒー', spentOn: '2026-09-11' }, b);
    expect(await getBalance()).toEqual({ amount: 250, fromUserId: a, toUserId: b });
  });

  it('立替を削除できる', async () => {
    const expense = await addExpense(
      { paidBy: a, amount: 2000, description: '食材', spentOn: '2026-09-01' },
      a,
    );
    await deleteExpense(expense.id);
    expect((await listHistory()).expenses).toHaveLength(0);
  });
});
