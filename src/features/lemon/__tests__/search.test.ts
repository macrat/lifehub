import { describe, expect, it } from 'vitest';
import type { DateString } from '../../../../shared/types.ts';
import { countActiveFilters as countWith } from '../../../lib/search.ts';
import { LEMON_FILTER_CONDITIONS, type LemonSearch } from '../search.ts';

const countActiveFilters = (search: LemonSearch) => countWith(search, LEMON_FILTER_CONDITIONS);

/** 何も絞り込んでいない状態 */
const NO_FILTERS: LemonSearch = {};

describe('countActiveFilters', () => {
  it('範囲は上下をまとめて 1 つと数え、キーワードは数えない', () => {
    expect(countActiveFilters(NO_FILTERS)).toBe(0);
    expect(countActiveFilters({ ...NO_FILTERS, q: '肥料' })).toBe(0);
    expect(
      countActiveFilters({
        ...NO_FILTERS,
        since: '2026-09-01' as DateString,
        until: '2026-09-30' as DateString,
      }),
    ).toBe(1);
    expect(
      countActiveFilters({ ...NO_FILTERS, kind: 'water', since: '2026-09-01' as DateString }),
    ).toBe(2);
  });
});
