import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iso, jst } from '../../shared/__tests__/jst.ts';
import type { DateString } from '../../shared/types.ts';
import { refreshHolidays } from '../features/holidays/service.ts';
import { weather, weatherHourly } from '../features/weather/schema.ts';
import { db } from '../lib/db/client.ts';
import { clearTables } from '../lib/db/test-db.ts';
import { apiClient, batchedApiClient, loginAs } from './login.ts';

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

/** 月の終わり際から次の月の初めまでの天気（日ごと・3 時間ごと） */
async function insertWeather() {
  await db
    .insert(weather)
    .values((['2030-05-31', '2030-06-01'] as DateString[]).map((date) => ({ date, code: '100' })));
  await db.insert(weatherHourly).values([
    { startsAt: jst('2030-05-31T21:00'), weather: '晴れ' },
    { startsAt: jst('2030-06-01T00:00'), weather: '晴れ' },
  ]);
}

/** 行った SQL 文（node-postgres の接続が送ったもの。トランザクションの中の文も含む） */
function recordStatements(): string[] {
  const statements: string[] = [];
  const query = pg.Client.prototype.query;
  vi.spyOn(pg.Client.prototype, 'query').mockImplementation(function (
    this: pg.Client,
    ...args: unknown[]
  ) {
    const config = args[0];
    statements.push(typeof config === 'string' ? config : (config as { text: string }).text);
    return (query as (...a: unknown[]) => unknown).apply(this, args) as never;
  });
  return statements;
}

/** 月の全日（画面は月ごとに 1 回ずつ呼ぶ。`calendarMonthQueryOptions`） */
const MONTHS = {
  april: { from: '2030-04-01', to: '2030-04-30' },
  may: { from: '2030-05-01', to: '2030-05-31' },
  june: { from: '2030-06-01', to: '2030-06-30' },
  july: { from: '2030-07-01', to: '2030-07-31' },
  august: { from: '2030-08-01', to: '2030-08-31' },
};

/**
 * カレンダーの面が読む 1 期間分（`calendar.get`）。項目・祝日・天気を 1 回で返し、どれも期間の外の日を含まない。
 * 面ごとに 3 本問い合わせていた形へ戻ったり、祝日や天気を全期間ぶん送り始めたりしたら、ここで気づける。
 */
describe('カレンダーの 1 期間分', () => {
  let api: ReturnType<typeof apiClient>;
  let batched: ReturnType<typeof batchedApiClient>;
  let userId: string;

  beforeEach(async () => {
    await clearTables();
    let cookie: string;
    ({ userId, cookie } = await loginAs('A'));
    api = apiClient(cookie);
    batched = batchedApiClient(cookie);
    // 祝日だけを表に入れておく（天気は空）。この後は外のサイトへ行けば失敗する
    vi.stubGlobal('fetch', async () => new Response(ICS));
    await refreshHolidays();
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline');
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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

  it('1 本の要求に載った月ごとの呼び出しは、それぞれ自分の月の分だけを返す', async () => {
    await insertWeather();
    await addEvent('またぐ', iso('2030-05-31T22:00'), iso('2030-06-01T02:00'));
    const [may, june] = await Promise.all([
      batched.calendar.get.query(MONTHS.may),
      batched.calendar.get.query(MONTHS.june),
    ]);
    expect(may.items.map((item) => item.placementDate)).toEqual(['2030-05-31']);
    expect(june.items.map((item) => item.placementDate)).toEqual(['2030-06-01']);
    expect([may.holidays, june.holidays]).toEqual([['2030-05-06'], []]);
    expect(may.weather.daily.map((w) => w.date)).toEqual(['2030-05-31']);
    expect(june.weather.hourly.map((w) => w.date)).toEqual(['2030-06-01']);
  });

  it('まとめて読んだ月は、1 か月ずつ読んだ月と同じ中身になる', async () => {
    await insertWeather();
    await api.events.create.mutate({
      kind: 'event',
      title: '毎週',
      startsAt: iso('2030-04-29T10:00'),
      endsAt: iso('2030-04-29T11:00'),
      participantIds: [userId],
      rrule: 'FREQ=WEEKLY',
    });
    await api.events.create.mutate({
      kind: 'task',
      title: '毎月のタスク',
      startsAt: iso('2030-05-15T09:00'),
      endsAt: null,
      participantIds: [userId],
      rrule: 'FREQ=MONTHLY',
    });
    const ranges = Object.values(MONTHS);
    const together = await Promise.all(ranges.map((range) => batched.calendar.get.query(range)));
    for (const [i, range] of ranges.entries()) {
      expect(together[i]).toEqual(await api.calendar.get.query(range));
    }
  });

  it('1 本の要求で 5 か月分を読んでも、天気・祝日・予定はそれぞれ 1 組の範囲の問い合わせで読む', async () => {
    const statements = recordStatements();
    await Promise.all(Object.values(MONTHS).map((range) => batched.calendar.get.query(range)));
    const reading = (table: string) =>
      statements.filter((text) => new RegExp(`from "${table}"(?!\\w)`).test(text)).length;
    expect(reading('weather')).toBe(1);
    expect(reading('weather_hourly')).toBe(1);
    expect(reading('holidays')).toBe(1);
    expect(reading('events')).toBe(1);
    // 読み取りだけなので、明示的なトランザクション（本番では別の往復）にしない
    expect(statements.filter((text) => /^(begin|commit)\b/i.test(text))).toEqual([]);
  });
});
