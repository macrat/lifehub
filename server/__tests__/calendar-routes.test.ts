import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshHolidays } from '../features/holidays/service.ts';
import { clearTables } from '../lib/db/test-db.ts';
import { apiClient, loginAs } from './login.ts';

/** 祝日の配布元の応答（2030-05-06 と、期間の外の 2030-07-15） */
const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:substitute',
  'DTSTART;VALUE=DATE:20300506',
  'DTEND;VALUE=DATE:20300507',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:marine',
  'DTSTART;VALUE=DATE:20300715',
  'DTEND;VALUE=DATE:20300716',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

/**
 * カレンダーの面が読む 1 期間分（`calendar.get`）。項目・祝日・天気を 1 回で返し、どれも期間の外の日を含まない。
 * 面ごとに 3 本問い合わせていた形へ戻ったり、祝日や天気を全期間ぶん送り始めたりしたら、ここで気づける。
 */
describe('カレンダーの 1 期間分', () => {
  let api: ReturnType<typeof apiClient>;
  let userId: string;

  beforeEach(async () => {
    await clearTables();
    let cookie: string;
    ({ userId, cookie } = await loginAs('A'));
    api = apiClient(cookie);
    // 祝日だけを表に入れておく（天気は空）。この後は外のサイトへ行けば失敗する
    vi.stubGlobal('fetch', async () => new Response(ICS));
    await refreshHolidays();
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline');
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const addEvent = (title: string, startsAt: string, endsAt: string) =>
    api.events.create.mutate({ kind: 'event', title, startsAt, endsAt, participantIds: [userId] });

  it('期間の項目と祝日と天気を 1 回で返し、外のサイトへは取りに行かない', async () => {
    // 書き込みは値を返さない
    expect(
      await addEvent('5 月', '2030-05-10T01:00:00.000Z', '2030-05-10T02:00:00.000Z'),
    ).toBeUndefined();
    await addEvent('6 月', '2030-06-10T01:00:00.000Z', '2030-06-10T02:00:00.000Z');

    const period = await api.calendar.get.query({ from: '2030-05-01', to: '2030-05-31' });
    expect(period.items.map((item) => item.title)).toEqual(['5 月']);
    expect(period.holidays).toEqual(['2030-05-06']);
    expect(period.weather).toEqual({ daily: [], hourly: [] });
  });
});
