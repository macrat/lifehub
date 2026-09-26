import { describe, expect, it } from 'vitest';
import type { DateString } from '../../../../shared/types.ts';
import { countActiveFilters as countWith } from '../../../lib/search.ts';
import { EXPENSE_FILTER_CONDITIONS, type ExpenseSearch } from '../search.ts';

const countActiveFilters = (search: ExpenseSearch) => countWith(search, EXPENSE_FILTER_CONDITIONS);

const ME = '11111111-1111-4111-8111-111111111111';
/** 何も絞り込んでいない状態 */
const NO_FILTERS: ExpenseSearch = {};

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
