import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dateStringSchema } from '../../../../shared/validation/common.ts';
import { truncateAll } from '../../../lib/test-db.ts';
import { listWeather, parseForecast, recordObservedTempMax, refreshWeather } from '../service.ts';

const range = (from: string, to: string) => ({
  from: dateStringSchema.parse(from),
  to: dateStringSchema.parse(to),
});
/** テストの予報のすべての日を含む期間 */
const ALL = range('2026-09-01', '2026-09-30');

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
    expect(await listWeather(ALL)).toContainEqual({
      date: '2026-09-24',
      icon: { symbol: 'cloud', change: 'sometimes', next: 'rain' },
      label: '曇一時雨',
      tempMax: 29,
    });
    // 2 回目は保存した天気を返す（取りに行かない）
    offline();
    expect(await listWeather(ALL)).toHaveLength(4);
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
    expect((await listWeather(ALL)).map((w) => [w.date, w.label, w.tempMax])).toEqual([
      ['2026-09-23', '雨時々止む', null],
      ['2026-09-24', '晴', 29],
      ['2026-09-25', '晴', 26],
      ['2026-09-26', '晴', 23],
    ]);

    offline();
    await expect(refreshWeather()).rejects.toThrow('offline');
    expect(await listWeather(ALL)).toHaveLength(4);
  });

  it('期間の中の日だけを返し、期間に天気が無くても一度取っていれば取りに行かない', async () => {
    serve(forecast(['302', '202', '200'], ['202', '200', '101']));
    expect((await listWeather(range('2026-09-24', '2026-09-25'))).map((w) => w.date)).toEqual([
      '2026-09-24',
      '2026-09-25',
    ]);
    offline();
    expect(await listWeather(range('2026-08-01', '2026-08-31'))).toEqual([]);
  });

  it('表に無い天気コードの日は返さない', async () => {
    serve(forecast(['999', '100', '100'], ['100', '100', '100']));
    expect((await listWeather(ALL)).map((w) => w.date)).not.toContain('2026-09-23');
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
    expect((await listWeather(ALL)).map((w) => [w.date, w.tempMax])).toEqual([
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
    await expect(listWeather(ALL)).rejects.toThrow('offline');
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
    expect((await listWeather(ALL)).find((w) => w.date === '2026-09-24')?.tempMax).toBe(31);
  });
});
