import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DateString } from '../../../shared/types.ts';
import {
  formatDateWithYear,
  formatMonth,
  formatWeekRange,
  monthRange,
  monthsInRange,
} from '../date.ts';

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

describe('formatDateWithYear', () => {
  it('年月日と曜日を 2 桁揃えで返す', () => {
    expect(formatDateWithYear(d('2026-09-20'))).toBe('2026年09月20日（日）');
    expect(formatDateWithYear(d('2026-01-05'))).toBe('2026年01月05日（月）');
  });

  it('瞬間は JST の暦日で返す', () => {
    expect(formatDateWithYear(new Date('2026-09-20T15:00:00Z'))).toBe('2026年09月21日（月）');
  });
});

describe('formatMonth', () => {
  it('年月を 2 桁揃えで返す', () => {
    expect(formatMonth(d('2026-09-20'))).toBe('2026年09月');
    expect(formatMonth(d('2026-01-01'))).toBe('2026年01月');
  });
});

describe('formatWeekRange', () => {
  // 「今年かどうか」で表示が変わるので今日を固定する
  beforeEach(() => vi.useFakeTimers({ now: new Date('2026-09-21T00:00:00+09:00') }));
  afterEach(() => vi.useRealTimers());

  it('今年なら年を書かず、同じ月なら終わりは日だけ', () => {
    expect(formatWeekRange(d('2026-09-14'))).toBe('09月14日〜20日');
  });

  it('月をまたぐなら終わりに月を足す', () => {
    expect(formatWeekRange(d('2026-08-31'))).toBe('08月31日〜09月06日');
  });

  it('今年でなければ始まりに年を足す', () => {
    expect(formatWeekRange(d('2030-01-14'))).toBe('2030年01月14日〜20日');
  });

  it('今年から翌年へまたぐ週は始まりの年で書く', () => {
    expect(formatWeekRange(d('2026-12-28'))).toBe('12月28日〜01月03日');
  });
});
