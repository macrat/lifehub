import { describe, expect, it } from 'vitest';
import type { DateString } from '../../../shared/types.ts';
import {
  dateColor,
  formatDateWithYear,
  formatMonth,
  formatTimelineTime,
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

describe('formatTimelineTime', () => {
  const now = new Date('2026-09-25T12:00:00+09:00');
  const at = (s: string) => new Date(`${s}+09:00`).toISOString();

  it('今日は時刻だけ、日付だけの記録は「今日」', () => {
    expect(formatTimelineTime(at('2026-09-25T08:05:00'), false, now)).toBe('08:05');
    expect(formatTimelineTime(at('2026-09-25T00:00:00'), true, now)).toBe('今日');
  });

  it('今年は月日から、別の年は年から', () => {
    expect(formatTimelineTime(at('2026-09-26T09:30:00'), false, now)).toBe('9/26(土) 09:30');
    expect(formatTimelineTime(at('2026-09-20T00:00:00'), true, now)).toBe('9/20(日)');
    expect(formatTimelineTime(at('2025-12-31T23:00:00'), false, now)).toBe('2025/12/31(水) 23:00');
  });
});

describe('dateColor', () => {
  it('土日は曜日の色、祝日は平日でも日曜と同じ色', () => {
    const sunday = dateColor(d('2030-05-05'), false);
    const weekday = dateColor(d('2030-05-07'), false);
    expect(dateColor(d('2030-05-04'), false)).not.toBe(weekday);
    expect(sunday).not.toBe(weekday);
    expect(dateColor(d('2030-05-06'), true)).toBe(sunday);
  });
});
