import { describe, expect, it } from 'vitest';
import type { DateString } from '../../../../shared/types.ts';
import type { CareLog } from '../queries.ts';
import { countActiveFilters, type LemonFilters, matchesCareLog } from '../search.ts';

/** 何も絞り込んでいない状態 */
const NO_FILTERS: LemonFilters = { q: '' };

const log = (values: Partial<CareLog> = {}): CareLog => ({
  id: 'l1',
  careType: 'water',
  // JST の 2026-09-20 09:00
  doneAt: '2026-09-20T00:00:00.000Z',
  note: '鉢の下から水が出るまで',
  createdBy: 'u1',
  ...values,
});

describe('matchesCareLog', () => {
  it('絞り込みが無ければすべてに一致する', () => {
    expect(matchesCareLog(log(), NO_FILTERS)).toBe(true);
  });

  it('種別で絞り込む', () => {
    expect(matchesCareLog(log({ careType: 'water' }), { ...NO_FILTERS, kind: 'water' })).toBe(true);
    expect(matchesCareLog(log({ careType: 'fertilize' }), { ...NO_FILTERS, kind: 'water' })).toBe(
      false,
    );
  });

  it('実施日の範囲は両端を含む', () => {
    const filters = {
      ...NO_FILTERS,
      since: '2026-09-20' as DateString,
      until: '2026-09-20' as DateString,
    };
    expect(matchesCareLog(log(), filters)).toBe(true);
    // JST の 9/19 23:00 と 9/21 00:00（どちらも 9/20 ではない）
    expect(matchesCareLog(log({ doneAt: '2026-09-19T14:00:00.000Z' }), filters)).toBe(false);
    expect(matchesCareLog(log({ doneAt: '2026-09-20T15:00:00.000Z' }), filters)).toBe(false);
  });

  it('日付は JST の暦日で比べる（UTC ではその前日の瞬間も同じ日）', () => {
    const filters = { ...NO_FILTERS, since: '2026-09-20' as DateString };
    // 2026-09-19T15:00Z = JST の 2026-09-20 00:00
    expect(matchesCareLog(log({ doneAt: '2026-09-19T15:00:00.000Z' }), filters)).toBe(true);
    expect(matchesCareLog(log({ doneAt: '2026-09-19T14:59:59.000Z' }), filters)).toBe(false);
  });

  it('キーワードと他の絞り込みは同時に効く（すべてを満たすものだけ）', () => {
    const filters = { ...NO_FILTERS, q: '肥料', kind: 'fertilize' as const };
    expect(matchesCareLog(log({ careType: 'fertilize', note: '肥料をやった' }), filters)).toBe(
      true,
    );
    expect(matchesCareLog(log({ careType: 'water', note: '肥料をやった' }), filters)).toBe(false);
    expect(matchesCareLog(log({ careType: 'fertilize', note: '水やり' }), filters)).toBe(false);
  });

  it('メモの無い記録はキーワードに一致しない', () => {
    expect(matchesCareLog(log({ note: null }), { ...NO_FILTERS, q: '肥料' })).toBe(false);
    expect(matchesCareLog(log({ note: null }), NO_FILTERS)).toBe(true);
  });
});

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
