import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarPeriod } from '../../shared/calendar.ts';
import { app } from '../app.ts';
import { truncateAll } from '../lib/test-db.ts';
import { loginAs } from './login.ts';

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
 * カレンダーの面が読む 1 期間分（`/api/calendar`）。項目・祝日・天気を 1 回で返し、どれも期間の外の日を含まない。
 * 面ごとに 3 本問い合わせていた形へ戻ったり、祝日や天気を全期間ぶん送り始めたりしたら、ここで気づける。
 */
describe('カレンダーの 1 期間分', () => {
  let cookie: string;
  let userId: string;

  beforeEach(async () => {
    await truncateAll();
    ({ userId, cookie } = await loginAs('A'));
    // 祝日は配布元の ics、天気は気象庁の予報（空の予報）を返す。外部のサイトに依存させない
    vi.stubGlobal('fetch', async (url: string) =>
      url.includes('webcal') ? new Response(ICS) : Response.json([]),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const addEvent = (title: string, startsAt: string, endsAt: string) =>
    app.request('/api/events', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'event', title, startsAt, endsAt, participantIds: [userId] }),
    });

  it('期間の項目と祝日と天気を 1 回で返す', async () => {
    // 書き込みは本文を返さない
    const added = await addEvent('5 月', '2030-05-10T01:00:00.000Z', '2030-05-10T02:00:00.000Z');
    expect(added.status).toBe(204);
    await addEvent('6 月', '2030-06-10T01:00:00.000Z', '2030-06-10T02:00:00.000Z');

    const res = await app.request('/api/calendar?from=2030-05-01&to=2030-05-31', {
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    const period = (await res.json()) as CalendarPeriod;
    expect(period.items.map((item) => item.title)).toEqual(['5 月']);
    expect(period.holidays).toEqual(['2030-05-06']);
    expect(period.weather).toEqual([]);
  });

  it('祝日と天気が取れなくても、項目は返す', async () => {
    await addEvent('5 月', '2030-05-10T01:00:00.000Z', '2030-05-10T02:00:00.000Z');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline');
    });

    const res = await app.request('/api/calendar?from=2030-05-01&to=2030-05-31', {
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    const period = (await res.json()) as CalendarPeriod;
    expect(period.items.map((item) => item.title)).toEqual(['5 月']);
    expect(period.holidays).toEqual([]);
    expect(period.weather).toEqual([]);
  });
});
