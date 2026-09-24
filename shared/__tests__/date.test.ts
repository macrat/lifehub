import { describe, expect, it } from 'vitest';
import { isDateString } from '../date.ts';
import { dateStringSchema } from '../validation/common.ts';

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
