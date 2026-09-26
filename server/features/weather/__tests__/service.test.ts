import { addMinutes } from 'date-fns';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DateString } from '../../../../shared/types.ts';
import { clearTables } from '../../../lib/db/test-db.ts';
import {
  listForecast,
  listWeather,
  parseForecast,
  recordObservedTemps,
  refreshWeather,
} from '../service.ts';

const SHORT_DAYS = [
  '2026-09-23T17:00:00+09:00',
  '2026-09-24T00:00:00+09:00',
  '2026-09-25T00:00:00+09:00',
];
const WEEKLY_DAYS = [
  '2026-09-24T00:00:00+09:00',
  '2026-09-25T00:00:00+09:00',
  '2026-09-26T00:00:00+09:00',
];

/**
 * 気象庁の予報と同じ形（短期予報と週間予報。ほかの地域・ほかの系列も混ざる）。
 * 短期予報の気温は 17 時の発表と同じく、翌日の最低（0 時）と最高（9 時）だけが載る。
 * 短期予報の降水確率は 6 時間ごと、週間予報の降水確率と気温は日ごとで、週間予報の初日は空になる。
 */
function forecast(short: string[], weekly: string[], shortMax = '29', shortDays = SHORT_DAYS) {
  const area = (code: string, weatherCodes: string[]) => ({ area: { code }, weatherCodes });
  return [
    {
      timeSeries: [
        {
          timeDefines: shortDays,
          areas: [area('130010', short), area('130040', ['100', '100', '100'])],
        },
        {
          timeDefines: [
            '2026-09-23T18:00:00+09:00',
            '2026-09-24T00:00:00+09:00',
            '2026-09-24T06:00:00+09:00',
          ],
          areas: [{ area: { code: '130010' }, pops: ['70', '10', '30'] }],
        },
        {
          timeDefines: ['2026-09-24T00:00:00+09:00', '2026-09-24T09:00:00+09:00'],
          areas: [{ area: { code: '44132' }, temps: ['19', shortMax] }],
        },
      ],
    },
    {
      timeSeries: [
        {
          timeDefines: WEEKLY_DAYS,
          areas: [{ ...area('130010', weekly), pops: ['', '40', '60'] }],
        },
        {
          timeDefines: WEEKLY_DAYS,
          areas: [
            { area: { code: '44132' }, tempsMax: ['', '26', '23'], tempsMin: ['', '18', '17'] },
          ],
        },
      ],
    },
  ];
}

/** 天気分布予報と同じ形。`start`（JST）から 3 時間ごとに天気が並ぶ（地点の気温も混ざる） */
function hourly(start: string, weather: string[], duration = 'PT3H') {
  const first = new Date(start);
  const timeDefines = weather.map((_, i) => ({
    dateTime: addMinutes(first, i * 180).toISOString(),
    duration,
  }));
  return {
    areaTimeSeries: { timeDefines, weather, wind: [] },
    pointTimeSeries: { timeDefines, temperature: weather.map(() => 20) },
  };
}

/**
 * 気象庁の応答を差し替える（外部のサイトに依存させない）。URL で日ごとの予報・3 時間ごとの予報・アメダスを出し分け、
 * 渡さなかったものは 404 にする。
 */
function serve(json: { forecast?: unknown; hourly?: unknown; amedas?: unknown }) {
  vi.stubGlobal('fetch', async (url: string) => {
    const key = url.includes('/wdist/')
      ? 'hourly'
      : url.includes('/amedas/')
        ? 'amedas'
        : 'forecast';
    const body = json[key];
    return body === undefined ? new Response(null, { status: 404 }) : Response.json(body);
  });
}
const offline = () =>
  vi.stubGlobal('fetch', async () => {
    throw new Error('offline');
  });

/** アメダスの観測値と同じ形。0:00 には前日の最高・最低気温が、0:10 からは今日の最高・最低気温が載る */
function amedas(max: number | null, min: number | null, day = '20260924') {
  return {
    [`${day}000000`]: { temp: [19.2, 0], maxTemp: [max, 0], minTemp: [min, 0] },
    [`${day}001000`]: { temp: [19.3, 0], maxTemp: [19.3, 0], minTemp: [19.3, 0] },
  };
}

/** 3 時間ごとの天気の無い報（日ごとの天気だけを確かめるとき） */
const NO_HOURLY = hourly('2026-09-24T18:00:00+09:00', []);

/** 日ごとの天気の一覧（テストの日を含む 9 月） */
const daily = async () => (await listWeather(SEP)).daily;
const SEP = { from: '2026-09-01' as DateString, to: '2026-09-30' as DateString };

describe('weather service', () => {
  beforeEach(clearTables);
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('東京の天気・気温・降水確率を日ごとに取り出し、重なる日は短期予報を採る', () => {
    expect(parseForecast(forecast(['302', '202', '200'], ['100', '100', '400']))).toEqual([
      { date: '2026-09-23', code: '302', tempMax: null, tempMin: null, pop: 70 },
      // 降水確率は 6 時間ごとのうち一番高いもの
      { date: '2026-09-24', code: '202', tempMax: 29, tempMin: 19, pop: 30 },
      // 短期予報に無い気温と降水確率は週間予報のもの
      { date: '2026-09-25', code: '200', tempMax: 26, tempMin: 18, pop: 40 },
      { date: '2026-09-26', code: '400', tempMax: 23, tempMin: 17, pop: 60 },
    ]);
  });

  it('取り直すと日ごとの天気を名前とアイコンで返し、範囲の外の日は返さない', async () => {
    serve({ forecast: forecast(['302', '202', '200'], ['202', '200', '101']), hourly: NO_HOURLY });
    expect(await refreshWeather()).toEqual({ daily: 4, hourly: 0 });
    expect(await daily()).toContainEqual({
      date: '2026-09-24',
      icon: { symbol: 'cloud', change: 'sometimes', next: 'rain' },
      label: '曇一時雨',
      tempMax: 29,
      tempMin: 19,
      pop: 30,
    });
    const range = await listWeather({
      from: '2026-09-24' as DateString,
      to: '2026-09-25' as DateString,
    });
    expect(range.daily.map((w) => w.date)).toEqual(['2026-09-24', '2026-09-25']);
  });

  it('取り直すと予報のある日を上書きし、予報から外れた日と、報から消えた最高気温は残す', async () => {
    serve({ forecast: forecast(['302', '202', '200'], ['202', '200', '101']), hourly: NO_HOURLY });
    await refreshWeather();
    // 次の報は 1 日進んでいる（23 日は予報から外れる）。24 日の最高気温は載っていない
    serve({
      forecast: forecast(['100', '100', '100'], ['100', '100', '100'], '', [
        '2026-09-24T11:00:00+09:00',
        '2026-09-25T00:00:00+09:00',
        '2026-09-26T00:00:00+09:00',
      ]),
      hourly: NO_HOURLY,
    });
    await refreshWeather();
    expect((await daily()).map((w) => [w.date, w.label, w.tempMax])).toEqual([
      ['2026-09-23', '雨時々止む', null],
      ['2026-09-24', '晴', 29],
      ['2026-09-25', '晴', 26],
      ['2026-09-26', '晴', 23],
    ]);

    offline();
    await expect(refreshWeather()).rejects.toThrow('refresh failed');
    expect(await daily()).toHaveLength(4);
  });

  it('日ごとと 3 時間ごとは、片方の取得に失敗してももう片方を書いてから投げる', async () => {
    serve({ hourly: hourly('2026-09-24T18:00:00+09:00', ['晴れ']) });
    await expect(refreshWeather()).rejects.toThrow('refresh failed');
    const range = await listWeather(SEP);
    expect(range.daily).toEqual([]);
    expect(range.hourly.map((w) => w.label)).toEqual(['晴れ']);
  });

  it('表に無い天気コードの日は返さない', async () => {
    serve({ forecast: forecast(['999', '100', '100'], ['100', '100', '100']), hourly: NO_HOURLY });
    await refreshWeather();
    expect((await daily()).map((w) => w.date)).not.toContain('2026-09-23');
  });

  it('昨日の最高・最低気温をアメダスの 0:00 の観測値で上書きする（整数に丸める）', async () => {
    serve({ forecast: forecast(['302', '202', '200'], ['202', '200', '101']), hourly: NO_HOURLY });
    await refreshWeather();
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url);
      return Response.json(amedas(24.6, 17.4));
    });
    // 2026-09-24 6:00 JST
    await recordObservedTemps(new Date('2026-09-23T21:00:00Z'));
    expect(urls).toEqual(['https://www.jma.go.jp/bosai/amedas/data/point/44132/20260924_00.json']);
    expect((await daily()).map((w) => [w.date, w.tempMax, w.tempMin])).toEqual([
      ['2026-09-23', 25, 17],
      ['2026-09-24', 29, 19],
      ['2026-09-25', 26, 18],
      ['2026-09-26', 23, 17],
    ]);
  });

  it('昨日の行が無ければ何も書かない', async () => {
    serve({ amedas: amedas(24.6, 17.4) });
    expect(await recordObservedTemps(new Date('2026-09-23T21:00:00Z'))).toBeUndefined();
    expect(await daily()).toEqual([]);
  });

  it('片方だけ欠測なら、欠測の側は予報の値を残す', async () => {
    serve({ forecast: forecast(['302', '202', '200'], ['202', '200', '101']), hourly: NO_HOURLY });
    await refreshWeather();
    serve({ amedas: amedas(null, 18.4, '20260925') });
    await recordObservedTemps(new Date('2026-09-24T21:00:00Z'));
    const day = (await daily()).find((w) => w.date === '2026-09-24');
    expect([day?.tempMax, day?.tempMin]).toEqual([29, 18]);
  });

  it('両方とも欠測なら何も書かずに投げ、予報の値を残す', async () => {
    serve({ forecast: forecast(['302', '202', '200'], ['202', '200', '101']), hourly: NO_HOURLY });
    await refreshWeather();
    serve({
      forecast: forecast(['302', '202', '200'], ['202', '200', '101'], '31'),
      hourly: NO_HOURLY,
    });
    await refreshWeather();
    serve({ amedas: amedas(null, null, '20260925') });
    await expect(recordObservedTemps(new Date('2026-09-24T21:00:00Z'))).rejects.toThrow('maxTemp');
    const day = (await daily()).find((w) => w.date === '2026-09-24');
    expect([day?.tempMax, day?.tempMin]).toEqual([31, 19]);
  });

  it('週間天気は今日から 8 日分の日ごとの天気を返す', async () => {
    serve({ forecast: forecast(['302', '202', '200'], ['202', '200', '101']), hourly: NO_HOURLY });
    await refreshWeather();
    // 2026-09-24 12:00 JST。23 日は過ぎた日なので入らない
    const days = await listForecast(new Date('2026-09-24T03:00:00Z'));
    expect(days.map((w) => w.date)).toEqual(['2026-09-24', '2026-09-25', '2026-09-26']);
    expect((await listForecast(new Date('2026-09-17T03:00:00Z'))).map((w) => w.date)).toEqual([
      '2026-09-23',
      '2026-09-24',
    ]);
  });

  describe('3 時間ごとの天気', () => {
    /** 3 時間ごとの天気だけを取り直す（日ごとの天気は空の報） */
    const refreshHourly = async (start: string, weather: string[]) => {
      serve({ forecast: forecast([], []), hourly: hourly(start, weather) });
      await refreshWeather();
    };
    const hourlyOf = async (from: string, to: string) =>
      (await listWeather({ from: from as DateString, to: to as DateString })).hourly;

    it('同じ日に続く同じ天気を 1 つの区間にまとめ、日をまたぐと分ける', async () => {
      await refreshHourly('2026-09-24T18:00:00+09:00', ['くもり', '雨', '雨', '雨', '雨', '晴れ']);
      expect(await hourlyOf('2026-09-24', '2026-09-25')).toEqual([
        { date: '2026-09-24', startMin: 1080, endMin: 1260, label: 'くもり', symbol: 'cloud' },
        { date: '2026-09-24', startMin: 1260, endMin: 1440, label: '雨', symbol: 'rain' },
        { date: '2026-09-25', startMin: 0, endMin: 540, label: '雨', symbol: 'rain' },
        { date: '2026-09-25', startMin: 540, endMin: 720, label: '晴れ', symbol: 'sun' },
      ]);
    });

    it('表に無い天気の区間は返さず、前後をつなげない', async () => {
      await refreshHourly('2026-09-24T18:00:00+09:00', ['晴れ', '霧', '晴れ']);
      expect(
        (await hourlyOf('2026-09-24', '2026-09-25')).map((w) => [w.startMin, w.endMin]),
      ).toEqual([
        [1080, 1260],
        [0, 180],
      ]);
    });

    it('取り直すと予報のある区間を上書きし、過ぎた区間は前の日の分も残す', async () => {
      await refreshHourly('2026-09-23T18:00:00+09:00', [
        '晴れ',
        '晴れ',
        '晴れ',
        '晴れ',
        '晴れ',
        '晴れ',
      ]);
      // 翌朝 5 時の発表。6 時から先だけが載る
      await refreshHourly('2026-09-24T06:00:00+09:00', ['雨', 'くもり']);
      expect(
        (await hourlyOf('2026-09-23', '2026-09-24')).map((w) => [
          w.date,
          w.startMin,
          w.endMin,
          w.label,
        ]),
      ).toEqual([
        ['2026-09-23', 1080, 1440, '晴れ'],
        ['2026-09-24', 0, 360, '晴れ'],
        ['2026-09-24', 360, 540, '雨'],
        ['2026-09-24', 540, 720, 'くもり'],
      ]);
    });

    it('範囲の日の区間だけを返す（両端の日を含む）', async () => {
      // 22 日 21 時から 26 日 0 時まで
      await refreshHourly('2026-09-22T21:00:00+09:00', ['雪', ...Array(24).fill('くもり'), '晴れ']);
      expect(
        (await hourlyOf('2026-09-23', '2026-09-25')).map((w) => [w.date, w.startMin, w.endMin]),
      ).toEqual([
        ['2026-09-23', 0, 1440],
        ['2026-09-24', 0, 1440],
        ['2026-09-25', 0, 1440],
      ]);
    });

    it('区間が 3 時間でない報は読まずに投げ、手元の天気を残す', async () => {
      await refreshHourly('2026-09-24T18:00:00+09:00', ['晴れ']);
      serve({
        forecast: forecast([], []),
        hourly: hourly('2026-09-24T18:00:00+09:00', ['雨'], 'PT1H'),
      });
      await expect(refreshWeather()).rejects.toThrow('refresh failed');
      expect((await hourlyOf('2026-09-24', '2026-09-24')).map((w) => w.label)).toEqual(['晴れ']);
    });
  });
});
