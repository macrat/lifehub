import { beforeEach, describe, expect, it } from 'vitest';
import { newId } from '../../../../shared/id.ts';
import { dateStringSchema } from '../../../../shared/validation/common.ts';
import { resetUsers } from '../../../lib/db/test-db.ts';
import {
  addExpense,
  deleteExpense,
  getSettlements,
  historySource,
  updateExpense,
} from '../service.ts';

/** 立替をすべて（お金の画面の一覧に並べる口から） */
const allExpenses = () => historySource({}).findInDays(undefined, undefined);

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
    expect(await allExpenses()).toMatchObject([
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

  it('編集した後に古い作成が送り直されても、編集は巻き戻らない', async () => {
    const id = newId();
    const input = { fromUserId: a, toUserId: null, amount: 2000, description: '食材', spentOn: on };
    await addExpense(input, a, id);
    await updateExpense(id, { ...input, amount: 3000 }, a);
    const resent = await addExpense(input, b, id);

    expect(resent).toMatchObject({ amount: 3000 });
    expect(await allExpenses()).toMatchObject([{ id, amount: 3000 }]);
  });

  it('立替を削除できる', async () => {
    const expense = await addExpense(
      { fromUserId: a, toUserId: null, amount: 2000, description: '食材', spentOn: on },
      a,
    );
    await deleteExpense(expense.id, a);
    expect(await allExpenses()).toHaveLength(0);
  });
});
