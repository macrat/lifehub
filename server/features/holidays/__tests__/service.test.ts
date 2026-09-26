import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dateStringSchema } from '../../../../shared/validation/common.ts';
import { clearTables } from '../../../lib/test-db.ts';
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

const range = (from: string, to: string) => ({
  from: dateStringSchema.parse(from),
  to: dateStringSchema.parse(to),
});
/** テストの ics のすべての日を含む期間 */
const ALL = range('2000-01-01', '2099-12-31');

/** 配布元の応答を差し替える（外部のサイトに依存させない） */
const serve = (ics: string) => vi.stubGlobal('fetch', async () => new Response(ics));
const offline = () =>
  vi.stubGlobal('fetch', async () => {
    throw new Error('offline');
  });

describe('holidays service', () => {
  beforeEach(clearTables);
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ics の繰り返しを展開し、除外日を落として日付順に並べる', () => {
    expect(parseHolidays(ICS)).toEqual([
      '2025-01-01',
      '2026-01-01',
      '2026-05-06',
      '2026-09-22',
      '2027-01-01',
    ]);
  });

  it('一覧は手元の表の期間の中だけを返し、配布元へは取りに行かない', async () => {
    offline();
    expect(await listHolidays(ALL)).toEqual([]);
    serve(ICS);
    await refreshHolidays();
    offline();
    expect(await listHolidays(range('2026-05-01', '2026-09-22'))).toEqual([
      '2026-05-06',
      '2026-09-22',
    ]);
  });

  it('取り直すと全体を入れ替え、失敗したら前の一覧を残す', async () => {
    serve(ICS);
    await refreshHolidays();
    serve(ICS.replace('DTSTART;VALUE=DATE:20260922', 'DTSTART;VALUE=DATE:20260921'));
    const dates = await refreshHolidays();
    expect(dates).toContain('2026-09-21');
    expect(dates).not.toContain('2026-09-22');

    offline();
    await expect(refreshHolidays()).rejects.toThrow('offline');
    expect(await listHolidays(ALL)).toEqual(dates);
  });
});
