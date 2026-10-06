import { describe, expect, it } from 'vitest';
import {
  type ExpenseTotal,
  nextScheduleDate,
  scheduleDatesBetween,
  settlementsOf,
} from '../money.ts';
import { dateStringSchema } from '../validation/common.ts';
import { expenseScheduleSchema } from '../validation/money.ts';

const total = (fromUserId: string | null, toUserId: string | null, amount: number) =>
  ({ fromUserId, toUserId, amount }) satisfies ExpenseTotal;

describe('settlementsOf', () => {
  it('貸し借りが無ければ移動なし', () => {
    expect(settlementsOf([])).toEqual([]);
    expect(settlementsOf([total('a', 'b', 500), total('b', 'a', 500)])).toEqual([]);
  });

  it('払った側が債権者、払ってもらった側が債務者になる', () => {
    expect(settlementsOf([total('a', null, 1000)])).toEqual([
      { creditorId: 'a', debtorId: null, amount: 1000 },
    ]);
    expect(settlementsOf([total(null, 'b', 300)])).toEqual([
      { creditorId: null, debtorId: 'b', amount: 300 },
    ]);
  });

  it('循環する貸し借りは打ち消す', () => {
    // a → b → 共有 → a と 1000 ずつ回っているだけ
    expect(
      settlementsOf([total('a', 'b', 1000), total('b', null, 1000), total(null, 'a', 1000)]),
    ).toEqual([]);
  });

  it('3 者とも正味が 0 でなければ、移動は 2 つにまとめ、額の大きい順に並べる', () => {
    // 正味: a +3000、b −1000、共有 −2000
    expect(
      settlementsOf([total('a', null, 2500), total('a', 'b', 500), total(null, 'b', 500)]),
    ).toEqual([
      { creditorId: 'a', debtorId: null, amount: 2000 },
      { creditorId: 'a', debtorId: 'b', amount: 1000 },
    ]);
  });

  it('中継するだけの当事者を挟まず、債権者と債務者を直接つなぐ', () => {
    // 共有が a に借り、b が共有に借りている。正味は共有が 0 なので b から a へ 1 回で済む
    expect(settlementsOf([total('a', null, 800), total(null, 'b', 800)])).toEqual([
      { creditorId: 'a', debtorId: 'b', amount: 800 },
    ]);
  });
});

describe('立替スケジュールの回の日', () => {
  const day = (date: string) => dateStringSchema.parse(date);

  it('毎月・毎年は最初の日から数え、無い日はその月の末日にして、次の月には元の日に戻る', () => {
    const monthly = { startsOn: day('2026-01-31'), frequency: 'monthly' } as const;
    expect(scheduleDatesBetween(monthly, day('2026-01-01'), day('2026-04-30'))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
    const yearly = { startsOn: day('2028-02-29'), frequency: 'yearly' } as const;
    expect(scheduleDatesBetween(yearly, day('2028-01-01'), day('2032-12-31'))).toEqual([
      '2028-02-29',
      '2029-02-28',
      '2030-02-28',
      '2031-02-28',
      '2032-02-29',
    ]);
  });

  it('after より後で through まで（through を含む）の回と、after より後の次の回', () => {
    const weekly = { startsOn: day('2026-10-01'), frequency: 'weekly' } as const;
    expect(scheduleDatesBetween(weekly, day('2026-10-01'), day('2026-10-15'))).toEqual([
      '2026-10-08',
      '2026-10-15',
    ]);
    expect(nextScheduleDate(weekly, day('2026-10-15'))).toBe('2026-10-22');
    // 最初の日より前なら最初の日
    expect(
      nextScheduleDate({ startsOn: day('2026-10-25'), frequency: 'daily' }, day('2026-10-06')),
    ).toBe('2026-10-25');
  });
});

describe('立替スケジュールの入力', () => {
  const input = {
    fromUserId: '00000000-0000-4000-8000-000000000001',
    toUserId: null,
    amount: 80_000,
    description: '家賃',
    startsOn: '2026-10-06',
    frequency: 'monthly',
  };

  it('組み合わせの規則は立替と同じ（From と To に同じ相手は選べない）', () => {
    expect(expenseScheduleSchema.safeParse(input).success).toBe(true);
    expect(expenseScheduleSchema.safeParse({ ...input, toUserId: input.fromUserId }).success).toBe(
      false,
    );
  });
});
