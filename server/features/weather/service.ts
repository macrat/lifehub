import { TZDate } from '@date-fns/tz';
import { z } from 'zod';
import { TIME_ZONE } from '../../../shared/constants.ts';
import {
  addDays,
  type DateRange,
  minutesOfDay,
  toDateString,
  today,
} from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';
import type { HourlyWeather, WeatherInRange } from '../../../shared/weather.ts';
import { fetchOk } from '../../lib/fetch.ts';
import * as repository from './repository.ts';
import { HOURLY_SYMBOLS, TELOPS } from './telops.ts';

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
            temps: z.array(z.string()).optional(),
            tempsMax: z.array(z.string()).optional(),
          }),
        ),
      }),
    ),
  }),
);

/**
 * アメダスの観測値（`AMEDAS_URL` のファイル）のうち読むところだけ。キーは観測時刻（JST の YYYYMMDDhhmmss）。
 * 値は [値, 品質フラグ] で、欠測の時は値が null になる。
 */
const amedasSchema = z.record(
  z.string(),
  z.object({ maxTemp: z.tuple([z.number().nullable(), z.number()]).optional() }),
);

/**
 * アメダス東京の観測値。気象庁のサイトが自分のアメダスのページのために配っている JSON で、予報と同じく
 * 公式の API ではないがキー不要で読める。3 時間ごとのファイルに 10 分ごとの値が並び、10 日ほど残る。
 */
const AMEDAS_URL = (day: string) =>
  `https://www.jma.go.jp/bosai/amedas/data/point/${STATION_CODE}/${day}_00.json`;

type Day = { code?: string; tempMax?: number };

/** 短期予報の気温のうち、最高気温を表す時刻（9 時 JST）か */
function isMaxTime(time: string): boolean {
  return new TZDate(time, TIME_ZONE).getHours() === 9;
}

/**
 * 予報の JSON から日ごとの天気コードと最高気温を取り出す（日付順。天気のある日だけ）。
 * 短期予報と週間予報が重なる日は、新しく細かい短期予報を採る。
 * 短期予報の気温は最低（0 時）と最高（9 時）が時刻で分かれて並ぶので、9 時の値だけを最高気温として読む
 * （発表の時間帯によって今日の最低が抜けるなど並びが変わるので、位置では読まない）。
 * 週間予報の最高気温は日ごとに並び、予報の無い日（初日）は空文字になる。
 */
export function parseForecast(json: unknown): repository.WeatherRow[] {
  const days = new Map<DateString, Day>();
  const put = (time: string, value: Day) => {
    const date = toDateString(new Date(time));
    days.set(date, { ...days.get(date), ...value });
  };
  // 週間予報を先に入れ、短期予報で上書きする
  for (const report of forecastSchema.parse(json).toReversed()) {
    for (const { timeDefines, areas } of report.timeSeries) {
      const codes = areas.find((a) => a.area.code === AREA_CODE)?.weatherCodes;
      const station = areas.find((a) => a.area.code === STATION_CODE);
      timeDefines.forEach((time, i) => {
        const code = codes?.[i];
        if (code) put(time, { code });
        const max = isMaxTime(time) ? station?.temps?.[i] : station?.tempsMax?.[i];
        // 週間予報の初日のように値の無い所は空文字で来る
        if (max) put(time, { tempMax: Number(max) });
      });
    }
  }
  return [...days]
    .flatMap(([date, { code, tempMax }]) =>
      code ? [{ date, code, tempMax: tempMax ?? null }] : [],
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** 日ごとの天気を取り直して、予報のある日を上書きする。上書きした日の数を返す */
async function refreshDailyWeather(): Promise<number> {
  const rows = parseForecast(await (await fetchOk(FORECAST_URL)).json());
  await repository.upsertDaily(rows);
  return rows.length;
}

/**
 * 昨日（JST）の最高気温をアメダス東京の観測値で上書きし、上書きした行を返す（毎朝の Cron）。
 * 予報の最高気温は日中を過ぎると報から外れ、外れた日には予報の値が残るので、終わった日は実際の値に直す。
 * 昨日の行（天気コード）が無ければ何もしない（`repository.updateTempMax`）。
 * 取得や解析に失敗したり、値が欠測だったりしたら何も書かずに投げる（予報の値が残る）。
 *
 * 気象庁の日最高気温は 0:10〜24:00 の値なので、今日の 0:00 の観測（`YYYYMMDD000000`）に載る
 * 「その時点までの最高気温」を読む。0:10 からは今日の値に切り替わる。
 * 観測は 0.1℃ 単位だが、予報に合わせて整数に丸める（列は整数で、カレンダーは整数で出す）。
 * WHY NOT 予報の Cron で毎回読む: 終わった日の値は朝には確定していて、1 日に何度読んでも同じになる。
 */
export async function recordObservedTempMax(
  now: Date = new Date(),
): Promise<repository.WeatherRow | undefined> {
  const day = today(now).replaceAll('-', '');
  const url = AMEDAS_URL(day);
  const max = amedasSchema.parse(await (await fetchOk(url)).json())[`${day}000000`]?.maxTemp?.[0];
  if (max == null) throw new Error(`weather: ${url} has no maxTemp at 00:00`);
  return repository.updateTempMax(addDays(today(now), -1), Math.round(max));
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
const SLOT_MINUTES = 180;

/**
 * 天気分布予報のうち読むところだけ（予報区の天気）。区間が 3 時間でなくなったら（形が変わったら）読まずに投げ、
 * 手元の天気を前回のまま残す。
 */
const hourlySchema = z.object({
  areaTimeSeries: z.object({
    timeDefines: z.array(z.object({ dateTime: z.string(), duration: z.literal('PT3H') })),
    weather: z.array(z.string()),
  }),
});

/** 天気分布予報の JSON から、区間ごとの天気を取り出す（時刻順） */
function parseHourlyForecast(json: unknown): repository.HourlyWeatherRow[] {
  const { timeDefines, weather } = hourlySchema.parse(json).areaTimeSeries;
  return timeDefines.flatMap(({ dateTime }, i) => {
    const w = weather[i];
    return w ? [{ startsAt: new Date(dateTime), weather: w }] : [];
  });
}

/** 3 時間ごとの天気を取り直して、予報のある区間を上書きする。上書きした区間の数を返す */
async function refreshHourlyWeather(): Promise<number> {
  const rows = parseHourlyForecast(await (await fetchOk(HOURLY_URL)).json());
  await repository.upsertHourly(rows);
  return rows.length;
}

/**
 * 日ごとの天気と 3 時間ごとの天気を気象庁から取り直し、上書きした数を返す（1 日 3 回の Cron）。
 * 2 つは取得先が別なので、片方が失敗してももう片方は書く。失敗したほうは何も書かず（手元の天気は前回のまま）、
 * 両方を書き終えてから、失敗をまとめて投げる（Cron の失敗として残す）。
 */
export async function refreshWeather(): Promise<{ daily: number; hourly: number }> {
  const [daily, hourly] = await Promise.allSettled([refreshDailyWeather(), refreshHourlyWeather()]);
  if (daily.status === 'fulfilled' && hourly.status === 'fulfilled') {
    return { daily: daily.value, hourly: hourly.value };
  }
  const errors = [daily, hourly].flatMap((r) => (r.status === 'rejected' ? [r.reason] : []));
  throw new AggregateError(errors, 'weather: refresh failed');
}

/**
 * [from, to]（両端を含む JST 暦日）の日ごとの天気（日付順）と 3 時間ごとの天気（時刻順）。
 * 過ぎた日は取っておいたすべて（その日・その区間の最後の予報）、先の日は予報のある所（日ごとは 7 日先、
 * 3 時間ごとは明日の終わり）まで。表に無い天気（気象庁が新しく足したものなど）は、アイコンを決められないので返さない。
 * 3 時間ごとの天気は、同じ日に間を空けずに続く同じ天気を 1 つの区間にまとめる（日をまたぐと分ける。`HourlyWeather`）。
 * 表に無い天気の区間は前後の区間ともつなげない。
 */
export async function listWeather(range: DateRange): Promise<WeatherInRange> {
  const rows = await repository.findBetween(range);
  const daily = rows.daily.flatMap(({ date, code, tempMax }) => {
    const telop = TELOPS[code];
    return telop ? [{ date, icon: telop[0], label: telop[1], tempMax }] : [];
  });
  const hourly: HourlyWeather[] = [];
  for (const { startsAt, weather } of rows.hourly) {
    const symbol = HOURLY_SYMBOLS[weather];
    if (!symbol) continue;
    const date = toDateString(startsAt);
    const startMin = minutesOfDay(startsAt);
    const last = hourly.at(-1);
    if (last?.date === date && last.label === weather && last.endMin === startMin) {
      last.endMin += SLOT_MINUTES;
    } else {
      hourly.push({ date, startMin, endMin: startMin + SLOT_MINUTES, symbol, label: weather });
    }
  }
  return { daily, hourly };
}
