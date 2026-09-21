import { describe, expect, it } from 'vitest';
import type { DateString } from '../../../../shared/types.ts';
import type { Expense } from '../queries.ts';
import { countActiveFilters, type ExpenseFilters, matchesExpense } from '../search.ts';

const ME = '11111111-1111-4111-8111-111111111111';
const PARTNER = '22222222-2222-4222-8222-222222222222';

/** 何も絞り込んでいない状態 */
const NO_FILTERS: ExpenseFilters = { q: '' };

const expense = (values: Partial<Expense> = {}): Expense => ({
  id: 'e1',
  fromUserId: ME,
  toUserId: null,
  amount: 1000,
  description: 'スーパーで買い物',
  spentOn: '2026-09-20' as DateString,
  createdAt: '2026-09-20T09:00:00.000Z',
  ...values,
});

describe('matchesExpense', () => {
  it('絞り込みが無ければすべてに一致する', () => {
    expect(matchesExpense(expense(), NO_FILTERS)).toBe(true);
  });

  it('金額の範囲は両端を含み、片方だけでも絞り込める', () => {
    expect(matchesExpense(expense({ amount: 1000 }), { ...NO_FILTERS, min: 1000 })).toBe(true);
    expect(matchesExpense(expense({ amount: 999 }), { ...NO_FILTERS, min: 1000 })).toBe(false);
    expect(matchesExpense(expense({ amount: 1000 }), { ...NO_FILTERS, max: 1000 })).toBe(true);
    expect(matchesExpense(expense({ amount: 1001 }), { ...NO_FILTERS, max: 1000 })).toBe(false);
  });

  it('日付の範囲は両端を含む', () => {
    const filters = {
      ...NO_FILTERS,
      since: '2026-09-01' as DateString,
      until: '2026-09-30' as DateString,
    };
    expect(matchesExpense(expense({ spentOn: '2026-09-01' as DateString }), filters)).toBe(true);
    expect(matchesExpense(expense({ spentOn: '2026-09-30' as DateString }), filters)).toBe(true);
    expect(matchesExpense(expense({ spentOn: '2026-08-31' as DateString }), filters)).toBe(false);
    expect(matchesExpense(expense({ spentOn: '2026-10-01' as DateString }), filters)).toBe(false);
  });

  it('To は共有とユーザーを選び分けられる', () => {
    const shared = expense({ toUserId: null });
    const forPartner = expense({ toUserId: PARTNER });
    expect(matchesExpense(shared, { ...NO_FILTERS, to: 'shared' })).toBe(true);
    expect(matchesExpense(forPartner, { ...NO_FILTERS, to: 'shared' })).toBe(false);
    expect(matchesExpense(forPartner, { ...NO_FILTERS, to: PARTNER })).toBe(true);
    expect(matchesExpense(shared, { ...NO_FILTERS, to: PARTNER })).toBe(false);
  });

  it('From は払った人で絞り込む', () => {
    expect(matchesExpense(expense({ fromUserId: ME }), { ...NO_FILTERS, from: ME })).toBe(true);
    expect(matchesExpense(expense({ fromUserId: PARTNER }), { ...NO_FILTERS, from: ME })).toBe(
      false,
    );
  });

  it('キーワードと他の絞り込みは同時に効く（すべてを満たすものだけ）', () => {
    const filters = { ...NO_FILTERS, q: 'スーパー', min: 500 };
    expect(
      matchesExpense(expense({ description: 'スーパーで買い物', amount: 1000 }), filters),
    ).toBe(true);
    expect(matchesExpense(expense({ description: 'コンビニ', amount: 1000 }), filters)).toBe(false);
    expect(matchesExpense(expense({ description: 'スーパーで買い物', amount: 100 }), filters)).toBe(
      false,
    );
  });
});

describe('countActiveFilters', () => {
  it('範囲は上下をまとめて 1 つと数える', () => {
    expect(countActiveFilters({ ...NO_FILTERS, min: 500 })).toBe(1);
    expect(countActiveFilters({ ...NO_FILTERS, min: 500, max: 1000 })).toBe(1);
    expect(
      countActiveFilters({
        ...NO_FILTERS,
        since: '2026-09-01' as DateString,
        until: '2026-09-30' as DateString,
      }),
    ).toBe(1);
  });

  it('キーワードは検索窓が示すので数えない', () => {
    expect(countActiveFilters({ ...NO_FILTERS, q: 'スーパー' })).toBe(0);
  });

  it('効いている条件の数を返す', () => {
    expect(countActiveFilters(NO_FILTERS)).toBe(0);
    expect(countActiveFilters({ ...NO_FILTERS, min: 500, to: 'shared', from: ME })).toBe(3);
  });
});
