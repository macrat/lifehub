import { TZDate } from '@date-fns/tz';
import { z } from 'zod';
import { TIME_ZONE } from '../../../shared/constants.ts';
import { toDateString } from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';
import { fetchOk } from '../../lib/fetch.ts';
import type { HourlyWeatherRow, PopRow, WeatherRow } from './repository.ts';

/**
 * 気象庁の配る JSON の取得と読み取り。形の検証と、保存する行への読み替えだけを持ち、保存も画面の形も知らない
 * （`service.ts` が取り直しの順番と保存を、`repository.ts` が保存を持つ）。
 */

/**
 * 気象庁の天気予報（東京都）。気象庁のサイトが自分の予報ページのために配っている JSON で、
 * 公式の API ではないが、キー不要で誰でも読める。1 日 3 回（5・11・17 時）更新される。
 * 1 つ目の報が今日から 3 日間の短期予報、2 つ目の報が明日から 7 日間の週間予報。
 */
const FORECAST_URL = 'https://www.jma.go.jp/bosai/forecast/data/forecast/130000.json';

/** 天気の地域: 東京地方（伊豆諸島・小笠原諸島を除く）。短期予報と週間予報で同じコードを使う */
const AREA_CODE = '130010';

/** 気温の地点: 東京（アメダスの地点コード）。短期予報・週間予報・アメダスの観測で同じコードを使う */
const STATION_CODE = '44132';

/** 読むところだけ。系列ごとに持つ値（天気・降水確率・気温）が違うので、どれも省略できる */
const forecastSchema = z.array(
  z.object({
    timeSeries: z.array(
      z.object({
        timeDefines: z.array(z.string()),
        areas: z.array(
          z.object({
            area: z.object({ code: z.string() }),
            weatherCodes: z.array(z.string()).optional(),
            pops: z.array(z.string()).optional(),
            temps: z.array(z.string()).optional(),
            tempsMax: z.array(z.string()).optional(),
            tempsMin: z.array(z.string()).optional(),
          }),
        ),
      }),
    ),
  }),
);

/** 観測値 1 つ。[値, 品質フラグ] で、欠測の時は値が null になる */
const observation = z.tuple([z.number().nullable(), z.number()]).optional();

/**
 * アメダスの観測値（`AMEDAS_URL` のファイル）のうち読むところだけ。キーは観測時刻（JST の YYYYMMDDhhmmss）。
 */
const amedasSchema = z.record(z.string(), z.object({ maxTemp: observation, minTemp: observation }));

/**
 * アメダス東京の観測値。気象庁のサイトが自分のアメダスのページのために配っている JSON で、予報と同じく
 * 公式の API ではないがキー不要で読める。3 時間ごとのファイルに 10 分ごとの値が並び、10 日ほど残る。
 */
const AMEDAS_URL = (day: string) =>
  `https://www.jma.go.jp/bosai/amedas/data/point/${STATION_CODE}/${day}_00.json`;

type Day = { code?: string; tempMax?: number; tempMin?: number; pop?: number };

/**
 * 短期予報の気温が表すもの。最低気温は 0 時、最高気温は 9 時（JST）の時刻で並ぶ。
 * 発表の時間帯によって今日の最低が抜けるなど並びが変わるので、位置では読まない。
 * ただし朝・昼の発表（5・11 時）は、今日の最高気温を「今日 9 時」「今日 0 時」の順に 2 度並べる
 * （今日の最低気温はもう予報しない）。同じ日の 9 時より後に来た 0 時の値は最低気温ではないので読まない（`parseForecast`）。
 */
function shortTempKind(time: string): 'tempMin' | 'tempMax' | undefined {
  const hour = new TZDate(time, TIME_ZONE).getHours();
  return hour === 0 ? 'tempMin' : hour === 9 ? 'tempMax' : undefined;
}

/**
 * 予報の JSON から日ごとの天気コード・最高／最低気温・降水確率を取り出す（日付順。天気のある日だけ）。
 * 短期予報と週間予報が重なる日は、新しく細かい短期予報の値を採る（短期予報に無い値は週間予報の値を残す）。
 * 短期予報の降水確率は 6 時間ごとに並ぶので、その日のうち一番高いものを 1 日の値にする
 * （傘が要るかを決めるのは一番降りやすい時間帯なので）。
 * 週間予報の気温と降水確率は日ごとに並び、予報の無い日（初日）は空文字になる。
 * 6 時間ごとの降水確率（`readPops`）も同じ JSON に載っているので、一緒に取り出す（JSON の検証は 1 度だけ）。
 */
export function parseForecast(json: unknown): {
  days: WeatherRow[];
  pops: PopRow[];
} {
  const reports = forecastSchema.parse(json);
  return { days: readDays(reports), pops: readPops(reports) };
}

type Forecast = z.infer<typeof forecastSchema>;

/** 予報から日ごとの天気を読む（`parseForecast`） */
function readDays(reports: Forecast): WeatherRow[] {
  const days = new Map<DateString, Day>();
  // 週間予報を先に入れ、短期予報で上書きする
  for (const report of reports.toReversed()) {
    const reported = new Map<DateString, Day>();
    for (const { timeDefines, areas } of report.timeSeries) {
      const area = areas.find((a) => a.area.code === AREA_CODE);
      const station = areas.find((a) => a.area.code === STATION_CODE);
      timeDefines.forEach((time, i) => {
        const date = toDateString(new Date(time));
        const day = reported.get(date) ?? {};
        reported.set(date, day);
        // 値の無い所は空文字で来る（週間予報の初日など）
        const read = (values: string[] | undefined) =>
          values?.[i] ? Number(values[i]) : undefined;
        const code = area?.weatherCodes?.[i];
        if (code) day.code = code;
        const pop = read(area?.pops);
        if (pop !== undefined) day.pop = Math.max(pop, day.pop ?? 0);
        const kind = shortTempKind(time);
        const temp = read(station?.temps);
        // 同じ日の最高気温の後に来た 0 時の値は、最高気温の繰り返し（`shortTempKind`）
        const repeatedMax = kind === 'tempMin' && day.tempMax !== undefined;
        if (kind && temp !== undefined && !repeatedMax) day[kind] = temp;
        const max = read(station?.tempsMax);
        if (max !== undefined) day.tempMax = max;
        const min = read(station?.tempsMin);
        if (min !== undefined) day.tempMin = min;
      });
    }
    for (const [date, day] of reported) days.set(date, { ...days.get(date), ...day });
  }
  return [...days]
    .flatMap(([date, { code, tempMax, tempMin, pop }]) =>
      code
        ? [{ date, code, tempMax: tempMax ?? null, tempMin: tempMin ?? null, pop: pop ?? null }]
        : [],
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 予報から 6 時間ごとの降水確率を読む（時刻順）。読むのは 1 つ目の報（短期予報）だけで、
 * 週間予報の降水確率（日ごと）は `readDays` が日ごとの天気に入れる。
 * 区切りは 0・6・12・18 時で、今日の過ぎた区間は載らない（発表の後の区間から）。
 */
function readPops(reports: Forecast): PopRow[] {
  const [short] = reports;
  return (short?.timeSeries ?? []).flatMap(({ timeDefines, areas }) => {
    const pops = areas.find((a) => a.area.code === AREA_CODE)?.pops;
    return pops
      ? timeDefines.flatMap((time, i) =>
          pops[i] ? [{ startsAt: new Date(time), pop: Number(pops[i]) }] : [],
        )
      : [];
  });
}

/**
 * 気象庁の天気分布予報（東京地方）。気象庁のサイトが予報ページの「時系列予報」のために配っている JSON で、
 * 日ごとの予報と同じく公式の API ではないがキー不要で読める。日ごとの予報と同じ時刻（5・11・17 時）に更新される。
 * 発表の次の 3 時間から明日の終わりまでの、3 時間ごとの天気と風（予報区ごと）と気温（地点ごと）が載る。
 * WHY NOT 1 時間ごとの天気: 気象庁が配る予報で一番細かいのが 3 時間ごと。1 時間ごとは数値予報モデル（GPV）の
 * 生の計算結果にしか無く、予報官の手の入った気象庁の予報と食い違う。
 */
const HOURLY_URL = `https://www.jma.go.jp/bosai/jmatile/data/wdist/VPFD/${AREA_CODE}.json`;

/** 区間の長さ（分）。`hourlySchema` が 3 時間の区間しか通さないので、これで足りる */
export const SLOT_MINUTES = 180;

/**
 * 天気分布予報のうち読むところだけ（予報区の天気と、地点（東京）の気温）。区間が 3 時間でなくなったら
 * （形が変わったら）読まずに投げ、手元の天気を前回のまま残す。気温は無くても天気は読む。
 * 地点の気温は区間でなく時刻ごと（3 時間おき）に並び、値の無い所は空文字で来ることがある。
 */
const hourlySchema = z.object({
  areaTimeSeries: z.object({
    timeDefines: z.array(z.object({ dateTime: z.string(), duration: z.literal('PT3H') })),
    weather: z.array(z.string()),
  }),
  pointTimeSeries: z
    .object({
      timeDefines: z.array(z.object({ dateTime: z.string() })),
      temperature: z.array(z.union([z.number(), z.string()])),
    })
    .optional(),
});

/**
 * 天気分布予報の JSON から、区間ごとの天気と気温を取り出す（時刻順）。気温は区間の始まりと同じ時刻の地点の気温
 * （気象庁の時系列予報の表と同じく、その時刻の予想気温）。
 */
function parseHourlyForecast(json: unknown): HourlyWeatherRow[] {
  const { areaTimeSeries, pointTimeSeries } = hourlySchema.parse(json);
  const temps = new Map<number, number>();
  pointTimeSeries?.timeDefines.forEach(({ dateTime }, i) => {
    const temp = pointTimeSeries.temperature[i];
    if (typeof temp === 'number') temps.set(new Date(dateTime).getTime(), temp);
  });
  return areaTimeSeries.timeDefines.flatMap(({ dateTime }, i) => {
    const w = areaTimeSeries.weather[i];
    const startsAt = new Date(dateTime);
    return w ? [{ startsAt, weather: w, temp: temps.get(startsAt.getTime()) ?? null }] : [];
  });
}

/** 日ごとの天気と 6 時間ごとの降水確率（どちらも同じ JSON に載っているので 1 回の取得で読む） */
export async function fetchForecast(): Promise<{ days: WeatherRow[]; pops: PopRow[] }> {
  return parseForecast(await (await fetchOk(FORECAST_URL)).json());
}

/** 3 時間ごとの天気と気温 */
export async function fetchHourlyForecast(): Promise<HourlyWeatherRow[]> {
  return parseHourlyForecast(await (await fetchOk(HOURLY_URL)).json());
}

/**
 * day（JST）の 0:00 の観測に載る「その時点までの最高・最低気温」（= 前日の最高・最低気温。0.1℃ 単位）。
 * 欠測はそれぞれ undefined。両方とも欠測なら投げる。
 */
export async function fetchMidnightObservation(
  day: DateString,
): Promise<{ max: number | undefined; min: number | undefined }> {
  const compact = day.replaceAll('-', '');
  const url = AMEDAS_URL(compact);
  const observed = amedasSchema.parse(await (await fetchOk(url)).json())[`${compact}000000`];
  const max = observed?.maxTemp?.[0] ?? undefined;
  const min = observed?.minTemp?.[0] ?? undefined;
  if (max === undefined && min === undefined) {
    throw new Error(`weather: ${url} has no maxTemp/minTemp at 00:00`);
  }
  return { max, min };
}
