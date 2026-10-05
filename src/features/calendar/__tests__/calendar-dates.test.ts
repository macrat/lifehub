import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DateString } from '../../../../shared/types.ts';
import { formatWeekRange, monthGridDays, weekStart } from '../calendar-dates.ts';

const d = (value: string) => value as DateString;

describe('weekStart', () => {
  it('その日を含む週の月曜。月曜ならその日', () => {
    expect(weekStart(d('2026-09-20'))).toBe('2026-09-14');
    expect(weekStart(d('2026-09-14'))).toBe('2026-09-14');
    // 月・年をまたぐ
    expect(weekStart(d('2027-01-01'))).toBe('2026-12-28');
  });
});

describe('monthGridDays', () => {
  it('1 日を含む週の月曜から 6 週ぶんの 42 日', () => {
    const days = monthGridDays('2026-09');
    expect(days).toHaveLength(42);
    expect(days[0]).toBe('2026-08-31');
    expect(days.at(-1)).toBe('2026-10-11');
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
