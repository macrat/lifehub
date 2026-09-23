import { beforeEach, describe, expect, it } from 'vitest';
import { truncateAll } from '../../../lib/test-db.ts';
import { listHolidays, parseHolidays, refreshHolidays } from '../service.ts';

/** 配布元と同じ書き方（毎年の祝日を RRULE で、例外を EXDATE で）の ics */
const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:new-year',
  'SUMMARY:元日',
  'RRULE:FREQ=YEARLY;UNTIL=20271231',
  'DTSTART;VALUE=DATE:20250101',
  'DTEND;VALUE=DATE:20250102',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:substitute',
  'SUMMARY:振替休日',
  'RRULE:FREQ=YEARLY;BYMONTH=5;BYMONTHDAY=6;BYDAY=MO,TU,WE;UNTIL=20271231',
  'EXDATE;VALUE=DATE:20250506',
  'DTSTART;VALUE=DATE:20250506',
  'DTEND;VALUE=DATE:20250507',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:once',
  'SUMMARY:国民の休日',
  'DTSTART;VALUE=DATE:20260922',
  'DTEND;VALUE=DATE:20260923',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const load = async () => ICS;
const failing = async (): Promise<string> => {
  throw new Error('offline');
};

describe('holidays service', () => {
  beforeEach(truncateAll);

  it('ics の繰り返しを展開し、除外日を落として日付順に並べる', () => {
    expect(parseHolidays(ICS)).toEqual([
      '2025-01-01',
      '2026-01-01',
      '2026-05-06',
      '2026-09-22',
      '2027-01-01',
    ]);
  });

  it('まだ一度も取っていなければ、一覧を返す前に取ってくる', async () => {
    expect(await listHolidays(load)).toContain('2026-09-22');
    // 2 回目は保存した一覧を返す（取りに行かない）
    expect(await listHolidays(failing)).toContain('2026-09-22');
  });

  it('取り直すと全体を入れ替え、失敗したら前の一覧を残す', async () => {
    await refreshHolidays(load);
    await refreshHolidays(async () =>
      ICS.replace('DTSTART;VALUE=DATE:20260922', 'DTSTART;VALUE=DATE:20260921'),
    );
    const dates = await listHolidays(failing);
    expect(dates).toContain('2026-09-21');
    expect(dates).not.toContain('2026-09-22');

    await expect(refreshHolidays(failing)).rejects.toThrow('offline');
    expect(await listHolidays(failing)).toEqual(dates);
  });
});
