import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DateString } from '../../../../shared/types.ts';
import { truncateAll } from '../../../lib/test-db.ts';
import {
  listHourlyWeather,
  listWeather,
  parseForecast,
  recordObservedTempMax,
  refreshHourlyWeather,
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
          timeDefines: ['2026-09-23T18:00:00+09:00'],
          areas: [{ area: { code: '130010' }, pops: ['70'] }],
        },
        {
          timeDefines: ['2026-09-24T00:00:00+09:00', '2026-09-24T09:00:00+09:00'],
          areas: [{ area: { code: '44132' }, temps: ['19', shortMax] }],
        },
      ],
    },
    {
      timeSeries: [
        { timeDefines: WEEKLY_DAYS, areas: [area('130010', weekly)] },
        {
          timeDefines: WEEKLY_DAYS,
          areas: [{ area: { code: '44132' }, tempsMax: ['', '26', '23'] }],
        },
      ],
    },
  ];
}

/** 天気分布予報と同じ形。`start`（JST）から 3 時間ごとに天気が並ぶ（地点の気温も混ざる） */
function hourly(start: string, weather: string[]) {
  const first = new Date(start).getTime();
  const timeDefines = weather.map((_, i) => ({
    dateTime: new Date(first + i * 3 * 3_600_000).toISOString(),
    duration: 'PT3H',
  }));
  return {
    areaTimeSeries: { timeDefines, weather, wind: [] },
    pointTimeSeries: { timeDefines, temperature: weather.map(() => 20) },
  };
}

/** 気象庁の応答を差し替える（外部のサイトに依存させない） */
const serve = (json: unknown) => vi.stubGlobal('fetch', async () => Response.json(json));
const offline = () =>
  vi.stubGlobal('fetch', async () => {
    throw new Error('offline');
  });

/** アメダスの観測値と同じ形。0:00 には前日の最高気温が、0:10 からは今日の最高気温が載る */
function amedas(maxAtMidnight: number | null, day = '20260924') {
  return {
    [`${day}000000`]: { temp: [19.2, 0], maxTemp: [maxAtMidnight, 0] },
    [`${day}001000`]: { temp: [19.3, 0], maxTemp: [19.3, 0] },
  };
}

describe('weather service', () => {
  beforeEach(truncateAll);
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('東京の天気と最高気温を日ごとに取り出し、重なる日は短期予報を採る', () => {
    expect(parseForecast(forecast(['302', '202', '200'], ['100', '100', '400']))).toEqual([
      { date: '2026-09-23', code: '302', tempMax: null },
      { date: '2026-09-24', code: '202', tempMax: 29 },
      { date: '2026-09-25', code: '200', tempMax: 26 },
      { date: '2026-09-26', code: '400', tempMax: 23 },
    ]);
  });

  it('まだ一度も取っていなければ、一覧を返す前に取ってくる', async () => {
    serve(forecast(['302', '202', '200'], ['202', '200', '101']));
    expect(await listWeather()).toContainEqual({
      date: '2026-09-24',
      icon: { symbol: 'cloud', change: 'sometimes', next: 'rain' },
      label: '曇一時雨',
      tempMax: 29,
    });
    // 2 回目は保存した天気を返す（取りに行かない）
    offline();
    expect(await listWeather()).toHaveLength(4);
  });

  it('取り直すと予報のある日を上書きし、予報から外れた日と、報から消えた最高気温は残す', async () => {
    serve(forecast(['302', '202', '200'], ['202', '200', '101']));
    await refreshWeather();
    // 次の報は 1 日進んでいる（23 日は予報から外れる）。24 日の最高気温は載っていない
    serve(
      forecast(['100', '100', '100'], ['100', '100', '100'], '', [
        '2026-09-24T11:00:00+09:00',
        '2026-09-25T00:00:00+09:00',
        '2026-09-26T00:00:00+09:00',
      ]),
    );
    await refreshWeather();
    expect((await listWeather()).map((w) => [w.date, w.label, w.tempMax])).toEqual([
      ['2026-09-23', '雨時々止む', null],
      ['2026-09-24', '晴', 29],
      ['2026-09-25', '晴', 26],
      ['2026-09-26', '晴', 23],
    ]);

    offline();
    await expect(refreshWeather()).rejects.toThrow('offline');
    expect(await listWeather()).toHaveLength(4);
  });

  it('表に無い天気コードの日は返さない', async () => {
    serve(forecast(['999', '100', '100'], ['100', '100', '100']));
    expect((await listWeather()).map((w) => w.date)).not.toContain('2026-09-23');
  });

  it('昨日の最高気温をアメダスの 0:00 の観測値で上書きする（整数に丸める）', async () => {
    serve(forecast(['302', '202', '200'], ['202', '200', '101']));
    await refreshWeather();
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url);
      return Response.json(amedas(24.6));
    });
    // 2026-09-24 6:00 JST
    await recordObservedTempMax(new Date('2026-09-23T21:00:00Z'));
    expect(urls).toEqual(['https://www.jma.go.jp/bosai/amedas/data/point/44132/20260924_00.json']);
    expect((await listWeather()).map((w) => [w.date, w.tempMax])).toEqual([
      ['2026-09-23', 25],
      ['2026-09-24', 29],
      ['2026-09-25', 26],
      ['2026-09-26', 23],
    ]);
  });

  it('昨日の行が無ければ何も書かない', async () => {
    serve(amedas(24.6));
    expect(await recordObservedTempMax(new Date('2026-09-23T21:00:00Z'))).toBeUndefined();
    offline();
    await expect(listWeather()).rejects.toThrow('offline');
  });

  it('欠測なら何も書かずに投げ、予報の値を残す', async () => {
    serve(forecast(['302', '202', '200'], ['202', '200', '101']));
    await refreshWeather();
    serve(forecast(['302', '202', '200'], ['202', '200', '101'], '31'));
    await refreshWeather();
    serve(amedas(null, '20260925'));
    await expect(recordObservedTempMax(new Date('2026-09-24T21:00:00Z'))).rejects.toThrow(
      'maxTemp',
    );
    expect((await listWeather()).find((w) => w.date === '2026-09-24')?.tempMax).toBe(31);
  });

  describe('3 時間ごとの天気', () => {
    const DAY = '2026-09-24' as DateString;
    // 2026-09-24 18:00 JST（17 時の発表を取った後）
    const NOW = new Date('2026-09-24T09:00:00Z');

    it('同じ日に続く同じ天気を 1 つの区間にまとめ、日をまたぐと分ける', async () => {
      serve(hourly('2026-09-24T18:00:00+09:00', ['くもり', '雨', '雨', '雨', '雨', '晴れ']));
      expect(await listHourlyWeather(DAY, NOW)).toEqual([
        { date: '2026-09-24', startMin: 1080, endMin: 1260, label: 'くもり', symbol: 'cloud' },
        { date: '2026-09-24', startMin: 1260, endMin: 1440, label: '雨', symbol: 'rain' },
        { date: '2026-09-25', startMin: 0, endMin: 540, label: '雨', symbol: 'rain' },
        { date: '2026-09-25', startMin: 540, endMin: 720, label: '晴れ', symbol: 'sun' },
      ]);
    });

    it('表に無い天気の区間は返さず、前後をつなげない', async () => {
      serve(hourly('2026-09-24T18:00:00+09:00', ['晴れ', '霧', '晴れ']));
      expect((await listHourlyWeather(DAY, NOW)).map((w) => [w.startMin, w.endMin])).toEqual([
        [1080, 1260],
        [0, 180],
      ]);
    });

    it('取り直すと予報のある区間を上書きし、過ぎた区間は前の日の分も残す', async () => {
      serve(hourly('2026-09-23T18:00:00+09:00', ['晴れ', '晴れ', '晴れ', '晴れ', '晴れ', '晴れ']));
      await refreshHourlyWeather();
      // 翌朝 5 時の発表。6 時から先だけが載る
      serve(hourly('2026-09-24T06:00:00+09:00', ['雨', 'くもり']));
      await refreshHourlyWeather();
      offline();
      expect(
        (await listHourlyWeather(DAY, NOW)).map((w) => [w.date, w.startMin, w.endMin, w.label]),
      ).toEqual([
        ['2026-09-23', 1080, 1440, '晴れ'],
        ['2026-09-24', 0, 360, '晴れ'],
        ['2026-09-24', 360, 540, '雨'],
        ['2026-09-24', 540, 720, 'くもり'],
      ]);
    });

    it('前後 1 日の分だけを返し、今日が入らない範囲は無くても取りに行かない', async () => {
      // 23 日 0 時から 25 日 21 時まで（22 日と 26 日は入らない）
      serve(hourly('2026-09-22T21:00:00+09:00', ['雪', ...Array(24).fill('くもり'), '晴れ']));
      await refreshHourlyWeather();
      offline();
      expect(
        (await listHourlyWeather(DAY, NOW)).map((w) => [w.date, w.startMin, w.endMin]),
      ).toEqual([
        ['2026-09-23', 0, 1440],
        ['2026-09-24', 0, 1440],
        ['2026-09-25', 0, 1440],
      ]);
      expect(await listHourlyWeather('2026-10-10' as DateString, NOW)).toEqual([]);
    });

    it('区間が 3 時間でない報は読まずに投げ、手元の天気を残す', async () => {
      serve(hourly('2026-09-24T18:00:00+09:00', ['晴れ']));
      await refreshHourlyWeather();
      const broken = hourly('2026-09-24T18:00:00+09:00', ['雨']);
      serve({
        areaTimeSeries: {
          ...broken.areaTimeSeries,
          timeDefines: broken.areaTimeSeries.timeDefines.map((t) => ({ ...t, duration: 'PT1H' })),
        },
      });
      await expect(refreshHourlyWeather()).rejects.toThrow();
      expect((await listHourlyWeather(DAY, NOW)).map((w) => w.label)).toEqual(['晴れ']);
    });
  });
});
