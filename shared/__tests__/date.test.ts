import { describe, expect, it } from 'vitest';
import { diffMonths, isDateString, isMonthString, monthRange, monthsInRange } from '../date.ts';
import type { DateString } from '../types.ts';
import { dateStringSchema } from '../validation/common.ts';

const d = (value: string) => value as DateString;

describe('isDateString', () => {
  it('実在する暦日を受け付ける', () => {
    expect(isDateString('2026-02-28')).toBe(true);
    expect(isDateString('2028-02-29')).toBe(true);
    expect(isDateString('2026-12-31')).toBe(true);
  });

  it('存在しない月日を拒む（繰り上げて読める日付も通さない）', () => {
    expect(isDateString('2026-02-29')).toBe(false);
    expect(isDateString('2026-02-31')).toBe(false);
    expect(isDateString('2026-13-01')).toBe(false);
    expect(isDateString('2026-00-10')).toBe(false);
    expect(isDateString('2026-04-00')).toBe(false);
  });

  it('形の違う文字列を拒む', () => {
    expect(isDateString('2026-2-3')).toBe(false);
    expect(isDateString('2026/02/03')).toBe(false);
    expect(isDateString('')).toBe(false);
  });
});

describe('dateStringSchema', () => {
  it('存在しない日付は検証エラーにする（DB まで届かせない）', () => {
    expect(dateStringSchema.safeParse('2026-02-31').success).toBe(false);
    expect(dateStringSchema.safeParse('2026-02-28').success).toBe(true);
  });
});

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

describe('diffMonths', () => {
  it('年をまたいでも月の差を返す', () => {
    expect(diffMonths('2026-09', '2026-09')).toBe(0);
    expect(diffMonths('2026-11', '2027-02')).toBe(3);
    expect(diffMonths('2027-02', '2026-11')).toBe(-3);
  });
});

describe('isMonthString', () => {
  it('実在する年月の YYYY-MM だけを受け付ける', () => {
    expect(isMonthString('2026-09')).toBe(true);
    expect(isMonthString('2026-13')).toBe(false);
    expect(isMonthString('2026-9')).toBe(false);
    expect(isMonthString('2026-09-01')).toBe(false);
  });
});
