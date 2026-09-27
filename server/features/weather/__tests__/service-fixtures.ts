import { addMinutes } from 'date-fns';
import { vi } from 'vitest';

/** 気象庁の応答の形（weather service のテストで共有する） */

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
export function forecast(
  short: string[],
  weekly: string[],
  shortMax = '29',
  shortDays = SHORT_DAYS,
) {
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

/**
 * 天気分布予報と同じ形。`start`（JST）から 3 時間ごとに天気が並ぶ。地点の気温は 20 度から 1 度ずつ上がり、
 * 天気より 1 つ多く並ぶ（最後の区間の終わりの時刻の分。実際の報と同じ）
 */
export function hourly(start: string, weather: string[], duration = 'PT3H') {
  const first = new Date(start);
  const timeDefines = weather.map((_, i) => ({
    dateTime: addMinutes(first, i * 180).toISOString(),
    duration,
  }));
  return {
    areaTimeSeries: { timeDefines, weather, wind: [] },
    pointTimeSeries: {
      timeDefines: [
        ...timeDefines,
        { dateTime: addMinutes(first, weather.length * 180).toISOString() },
      ].map(({ dateTime }) => ({ dateTime })),
      temperature: [...weather, ''].map((_, i) => 20 + i),
    },
  };
}

/**
 * 気象庁の応答を差し替える（外部のサイトに依存させない）。URL で日ごとの予報・3 時間ごとの予報・アメダスを出し分け、
 * 渡さなかったものは 404 にする。
 */
export function serve(json: { forecast?: unknown; hourly?: unknown; amedas?: unknown }) {
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
export const offline = () =>
  vi.stubGlobal('fetch', async () => {
    throw new Error('offline');
  });

/** アメダスの観測値と同じ形。0:00 には前日の最高・最低気温が、0:10 からは今日の最高・最低気温が載る */
export function amedas(max: number | null, min: number | null, day = '20260924') {
  return {
    [`${day}000000`]: { temp: [19.2, 0], maxTemp: [max, 0], minTemp: [min, 0] },
    [`${day}001000`]: { temp: [19.3, 0], maxTemp: [19.3, 0], minTemp: [19.3, 0] },
  };
}

/** 3 時間ごとの天気の無い報（日ごとの天気だけを確かめるとき） */
export const NO_HOURLY = hourly('2026-09-24T18:00:00+09:00', []);
