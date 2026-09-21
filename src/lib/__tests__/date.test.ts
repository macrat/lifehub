import { describe, expect, it } from 'vitest';
import type { DateString } from '../../../shared/types.ts';
import { monthRange, monthsInRange } from '../date.ts';

const d = (value: string) => value as DateString;

describe('monthRange', () => {
  it('月の初日から末日までを返す', () => {
    expect(monthRange('2026-09')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(monthRange('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });
});

describe('monthsInRange', () => {
  it('範囲に掛かる月を昇順で返す', () => {
    expect(monthsInRange(d('2026-09-10'), d('2026-09-20'))).toEqual(['2026-09']);
    // 月表示のグリッド（8/31〜10/11）は 3 か月に掛かる
    expect(monthsInRange(d('2026-08-31'), d('2026-10-11'))).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
  });

  it('年をまたいでも連続する', () => {
    expect(monthsInRange(d('2026-11-30'), d('2027-01-04'))).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
    ]);
  });

  it('同じ日なら 1 か月', () => {
    expect(monthsInRange(d('2026-09-21'), d('2026-09-21'))).toEqual(['2026-09']);
  });
});
