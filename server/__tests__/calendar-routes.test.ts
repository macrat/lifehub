import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iso, jst } from '../../shared/__tests__/jst.ts';
import type { DateString } from '../../shared/types.ts';
import { refreshHolidays } from '../features/holidays/service.ts';
import { weather, weatherHourly } from '../features/weather/schema.ts';
import { db } from '../lib/db/client.ts';
import { clearTables } from '../lib/db/test-db.ts';
import { apiClient, loginAs } from './login.ts';

/** 祝日の配布元の応答（2030-05-06 と、2030-07-15） */
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

/** 期間の終わり際から次の月の初めまでの天気（日ごと・3 時間ごと） */
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

/**
 * カレンダーの面が読む月ごとの中身（`calendar.get`）。項目・祝日・天気を 1 回で返し、どの月もその月の外の日を含まない。
 * 面ごとに 3 本問い合わせていた形へ戻ったり、祝日や天気を全期間ぶん送り始めたり、
 * 月の数だけ同じ形の問い合わせを繰り返し始めたりしたら（N+1）、ここで気づける。
 */
describe('カレンダーの月ごとの中身', () => {
  let api: ReturnType<typeof apiClient>;
  let userId: string;

  beforeEach(async () => {
    await clearTables();
    let cookie: string;
    ({ userId, cookie } = await loginAs('A'));
    api = apiClient(cookie);
    // 祝日を表に入れておく。この後は外のサイトへ行けば失敗する
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

  const addEvent = (title: string, startsAt: string, endsAt: string, rrule?: string) =>
    api.events.create.mutate({
      kind: 'event',
      title,
      startsAt,
      endsAt,
      participantIds: [userId],
      ...(rrule && { rrule }),
    });

  it('月の項目と祝日と天気を 1 回で返し、外のサイトへは取りに行かない', async () => {
    // 書き込みは値を返さない
    expect(
      await addEvent('5 月', '2030-05-10T01:00:00.000Z', '2030-05-10T02:00:00.000Z'),
    ).toBeUndefined();
    await addEvent('6 月', '2030-06-10T01:00:00.000Z', '2030-06-10T02:00:00.000Z');

    const { '2030-05': may } = await api.calendar.get.query({ months: ['2030-05'] });
    expect(may?.items.map((item) => item.title)).toEqual(['5 月']);
    expect(may?.holidays).toEqual(['2030-05-06']);
    expect(may?.weather).toEqual({ daily: [], hourly: [] });
  });

  it('複数の月を月ごとに分けて返し、月をまたぐ予定はどちらの月にも日ごとに出る', async () => {
    await insertWeather();
    await addEvent('またぐ', iso('2030-05-31T22:00'), iso('2030-06-01T02:00'));

    const {
      '2030-05': may,
      '2030-06': june,
      '2030-07': july,
    } = await api.calendar.get.query({ months: ['2030-06', '2030-05', '2030-07'] });
    expect(may?.items.map((item) => [item.placementDate, item.title])).toEqual([
      ['2030-05-31', 'またぐ'],
    ]);
    expect(june?.items.map((item) => [item.placementDate, item.title])).toEqual([
      ['2030-06-01', 'またぐ'],
    ]);
    expect(july?.items).toEqual([]);
    expect([may?.holidays, june?.holidays, july?.holidays]).toEqual([
      ['2030-05-06'],
      [],
      ['2030-07-15'],
    ]);
    expect(may?.weather.daily.map((w) => w.date)).toEqual(['2030-05-31']);
    expect(june?.weather.daily.map((w) => w.date)).toEqual(['2030-06-01']);
    expect(may?.weather.hourly.map((w) => w.date)).toEqual(['2030-05-31']);
    expect(june?.weather.hourly.map((w) => w.date)).toEqual(['2030-06-01']);
  });

  it('まとめて読んだ月は、1 か月ずつ読んだ月と同じ中身になる', async () => {
    await insertWeather();
    await addEvent('毎週', iso('2030-04-29T10:00'), iso('2030-04-29T11:00'), 'FREQ=WEEKLY');
    await addEvent('またぐ', iso('2030-05-31T22:00'), iso('2030-06-01T02:00'));
    await api.events.create.mutate({
      kind: 'task',
      title: '毎月のタスク',
      startsAt: iso('2030-05-15T09:00'),
      endsAt: null,
      participantIds: [userId],
      rrule: 'FREQ=MONTHLY',
    });

    const months = ['2030-04', '2030-05', '2030-06', '2030-07'];
    const together = await api.calendar.get.query({ months });
    for (const month of months) {
      expect(together[month]).toEqual((await api.calendar.get.query({ months: [month] }))[month]);
    }
  });

  it('5 か月分を読んでも、天気・祝日・予定はそれぞれ 1 組の範囲の問い合わせで読む', async () => {
    const statements = recordStatements();
    const periods = await api.calendar.get.query({
      months: ['2030-04', '2030-05', '2030-06', '2030-07', '2030-08'],
    });
    expect(Object.keys(periods)).toHaveLength(5);
    const reading = (table: string) =>
      statements.filter((text) => new RegExp(`from "${table}"(?!\\w)`).test(text)).length;
    expect(reading('weather')).toBe(1);
    expect(reading('weather_hourly')).toBe(1);
    expect(reading('holidays')).toBe(1);
    expect(reading('events')).toBe(1);
  });

  it('幅の広すぎる月の組は読まずに断る（間の月もすべて読んで展開することになる）', async () => {
    await expect(api.calendar.get.query({ months: ['2020-01', '2030-01'] })).rejects.toThrow(
      '120 か月の幅まで',
    );
  });
});
