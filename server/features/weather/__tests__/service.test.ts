import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { truncateAll } from '../../../lib/test-db.ts';
import { listWeather, parseForecast, refreshWeather } from '../service.ts';

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
});
