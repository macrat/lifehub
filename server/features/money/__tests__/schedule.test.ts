import { beforeEach, describe, expect, it } from 'vitest';
import { dateStringSchema } from '../../../../shared/validation/common.ts';
import type { ExpenseScheduleInput } from '../../../../shared/validation/money.ts';
import { resetUsers } from '../../../lib/db/test-db.ts';
import {
  addExpenseSchedule,
  deleteExpense,
  deleteExpenseSchedule,
  getSettlements,
  listExpenseSchedules,
  listRecords,
  recordScheduledExpenses,
  updateExpenseSchedule,
} from '../service.ts';

/**
 * 立替スケジュール: 日が来た回だけを普通の立替として記録し、先の日の回は記録しない。記録した立替を消しても記録し直さず、
 * スケジュールの変更・削除はまだ記録していない回にだけ効く。
 */

const allExpenses = async () =>
  (await listRecords({})).items.map((e) => [e.occurredOn, e.description, e.amount]).sort();

const at = (date: string) => new Date(`${date}T09:00:00+09:00`);

let a: string;
let b: string;

const rent = (startsOn: string): ExpenseScheduleInput => ({
  fromUserId: a,
  toUserId: null,
  amount: 80_000,
  description: '家賃',
  startsOn: dateStringSchema.parse(startsOn),
  frequency: 'monthly',
});

describe('立替スケジュール', () => {
  beforeEach(async () => {
    ({ userId: a, partnerId: b } = await resetUsers());
  });

  it('作ると今日までの回をその場で記録し、先の日の回は日が来たら記録する', async () => {
    await addExpenseSchedule(rent('2026-08-25'), a, undefined, at('2026-10-06'));
    expect(await allExpenses()).toEqual([
      ['2026-08-25', '家賃', 80_000],
      ['2026-09-25', '家賃', 80_000],
    ]);
    expect(await getSettlements()).toEqual([{ creditorId: a, debtorId: null, amount: 160_000 }]);
    expect(await listExpenseSchedules()).toMatchObject([
      { description: '家賃', startsOn: '2026-08-25', frequency: 'monthly' },
    ]);

    expect(await recordScheduledExpenses(at('2026-10-24'))).toEqual({ count: 0 });
    // Cron が止まっていた日の回もまとめて記録し、2 度目は記録しない
    expect(await recordScheduledExpenses(at('2026-11-26'))).toEqual({ count: 2 });
    expect(await recordScheduledExpenses(at('2026-11-26'))).toEqual({ count: 0 });
    expect((await allExpenses()).map(([date]) => date)).toEqual([
      '2026-08-25',
      '2026-09-25',
      '2026-10-25',
      '2026-11-25',
    ]);
  });

  it('記録が重ねて走っても、同じ回を二重に記録しない', async () => {
    await addExpenseSchedule(rent('2026-10-25'), a, undefined, at('2026-10-06'));
    const results = await Promise.all([
      recordScheduledExpenses(at('2026-11-26')),
      recordScheduledExpenses(at('2026-11-26')),
    ]);
    expect(results.reduce((sum, { count }) => sum + count, 0)).toBe(2);
    expect((await allExpenses()).map(([date]) => date)).toEqual(['2026-10-25', '2026-11-25']);
  });

  it('同じ ID で送り直しても二重に記録しない', async () => {
    const id = '01990000-0000-7000-8000-0000000000a1';
    await addExpenseSchedule(rent('2026-10-06'), a, id, at('2026-10-06'));
    await addExpenseSchedule(rent('2026-10-06'), a, id, at('2026-10-06'));
    expect(await allExpenses()).toHaveLength(1);
  });

  it('最初の日が先なら、その日まで何も記録しない', async () => {
    await addExpenseSchedule(rent('2026-10-25'), a, undefined, at('2026-10-06'));
    expect(await allExpenses()).toEqual([]);
    expect(await recordScheduledExpenses(at('2026-10-24'))).toEqual({ count: 0 });
    expect(await recordScheduledExpenses(at('2026-10-25'))).toEqual({ count: 1 });
  });

  it('記録した立替を消しても記録し直さない', async () => {
    await addExpenseSchedule(rent('2026-09-25'), a, undefined, at('2026-10-06'));
    const [row] = (await listRecords({})).items;
    if (!row) throw new Error('立替が無い');
    await deleteExpense(row.id, a);
    expect(await recordScheduledExpenses(at('2026-10-06'))).toEqual({ count: 0 });
    expect(await allExpenses()).toEqual([]);
  });

  it('変えるとまだ記録していない回に効き、消すとこれからの回を記録しない（記録した立替は残る）', async () => {
    await addExpenseSchedule(rent('2026-09-25'), a, undefined, at('2026-10-06'));
    const [schedule] = await listExpenseSchedules();
    if (!schedule) throw new Error('スケジュールが無い');
    await updateExpenseSchedule(schedule.id, {
      ...rent('2026-09-25'),
      amount: 85_000,
      toUserId: b,
    });
    await recordScheduledExpenses(at('2026-10-25'));
    expect(await allExpenses()).toEqual([
      ['2026-09-25', '家賃', 80_000],
      ['2026-10-25', '家賃', 85_000],
    ]);

    await deleteExpenseSchedule(schedule.id);
    expect(await listExpenseSchedules()).toEqual([]);
    expect(await recordScheduledExpenses(at('2026-11-25'))).toEqual({ count: 0 });
    expect(await allExpenses()).toHaveLength(2);
  });
});
