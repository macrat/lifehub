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
import type { DateString, HistoryPage } from '../../../shared/types.ts';
import type {
  DailyWeather,
  HourlyWeather,
  WeatherDay,
  WeatherInRange,
} from '../../../shared/weather.ts';
import { fetchOk } from '../../lib/fetch.ts';
import { listHolidays } from '../holidays/service.ts';
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
  days: repository.WeatherRow[];
  pops: repository.PopRow[];
} {
  const reports = forecastSchema.parse(json);
  return { days: readDays(reports), pops: readPops(reports) };
}

type Forecast = z.infer<typeof forecastSchema>;

/** 予報から日ごとの天気を読む（`parseForecast`） */
function readDays(reports: Forecast): repository.WeatherRow[] {
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
function readPops(reports: Forecast): repository.PopRow[] {
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
 * 日ごとの天気と 6 時間ごとの降水確率を取り直して、予報のある日・区間を上書きする。上書きした日の数を返す。
 * どちらも同じ JSON に載っているので、1 回の取得で両方を書く。
 */
async function refreshDailyWeather(): Promise<number> {
  const { days, pops } = parseForecast(await (await fetchOk(FORECAST_URL)).json());
  await Promise.all([repository.upsertDaily(days), repository.upsertPops(pops)]);
  return days.length;
}

/**
 * 昨日（JST）の最高・最低気温をアメダス東京の観測値で上書きし、上書きした行を返す（毎朝の Cron）。
 * 予報の気温は日中を過ぎると報から外れ、外れた日には予報の値が残るので、終わった日は実際の値に直す。
 * 昨日の行（天気コード）が無ければ何もしない（`repository.updateTemps`）。
 * 片方だけ欠測ならもう片方だけを書く。取得や解析に失敗したり、両方とも欠測だったりしたら何も書かずに投げる
 * （予報の値が残る）。
 *
 * 気象庁の日最高・最低気温は 0:10〜24:00 の値なので、今日の 0:00 の観測（`YYYYMMDD000000`）に載る
 * 「その時点までの最高・最低気温」を読む。0:10 からは今日の値に切り替わる。
 * 観測は 0.1℃ 単位だが、予報に合わせて整数に丸める（列は整数で、画面は整数で出す）。
 * WHY NOT 予報の Cron で毎回読む: 終わった日の値は朝には確定していて、1 日に何度読んでも同じになる。
 */
export async function recordObservedTemps(
  now: Date = new Date(),
): Promise<repository.WeatherRow | undefined> {
  const day = today(now).replaceAll('-', '');
  const url = AMEDAS_URL(day);
  const observed = amedasSchema.parse(await (await fetchOk(url)).json())[`${day}000000`];
  const max = observed?.maxTemp?.[0];
  const min = observed?.minTemp?.[0];
  if (max == null && min == null)
    throw new Error(`weather: ${url} has no maxTemp/minTemp at 00:00`);
  return repository.updateTemps(addDays(today(now), -1), {
    ...(max != null && { tempMax: Math.round(max) }),
    ...(min != null && { tempMin: Math.round(min) }),
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
const SLOT_MINUTES = 180;

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
function parseHourlyForecast(json: unknown): repository.HourlyWeatherRow[] {
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
 * 画面に出す日ごとの天気の名前。気象庁の名前の変わり方の「後」を「のち」に開く（「晴後雨」→「晴のち雨」）。
 * 前後の漢字に挟まれた「後」は 1 字の漢字に埋もれて読みにくく、天気予報の読み上げや新聞と同じ書き方にする。
 * 開くのは前後に字のある「後」だけで、「午後」（「晴午後は雷雨」）は時刻なので開かない。
 * WHY NOT `telops.ts` の表を書き換える: 表は気象庁の表の写しで、写しのままにしておくと突き合わせられる。
 */
export function readableLabel(label: string): string {
  return label.replace(/(?<=[^午])後(?=.)/g, 'のち');
}

/** 日ごとの天気の行を、画面に出す形にする。表に無い天気の日は、アイコンを決められないので除く */
function toDaily(rows: repository.WeatherRow[]): DailyWeather[] {
  return rows.flatMap(({ code, ...values }) => {
    const telop = TELOPS[code];
    return telop ? [{ ...values, icon: telop[0], label: readableLabel(telop[1]) }] : [];
  });
}

/**
 * 3 時間ごとの天気の行を、その日付と、日付の 0:00 からの分に直す。表に無い天気の区間は、アイコンを決められないので
 * undefined（カレンダーでも天気の画面でも出さない）
 */
function toSlot({ startsAt, weather, temp }: repository.HourlyWeatherRow) {
  const symbol = HOURLY_SYMBOLS[weather];
  if (!symbol) return undefined;
  return {
    date: toDateString(startsAt),
    startMin: minutesOfDay(startsAt),
    symbol,
    label: weather,
    temp,
  };
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
  const daily = toDaily(rows.daily);
  const hourly: HourlyWeather[] = [];
  for (const row of rows.hourly) {
    const slot = toSlot(row);
    if (!slot) continue;
    const { date, startMin, symbol, label } = slot;
    const last = hourly.at(-1);
    if (last?.date === date && last.label === label && last.endMin === startMin) {
      last.endMin += SLOT_MINUTES;
    } else {
      hourly.push({ date, startMin, endMin: startMin + SLOT_MINUTES, symbol, label });
    }
  }
  return { daily, hourly };
}

/** 週間天気の最新のページの、今日から先の日数（今日を含む）。週間予報は明日から 7 日分なので、今日と合わせて 8 日 */
const FORECAST_DAYS = 8;

/** 週間天気の最新のページに入れる過ぎた日の数。開いたとき、今日の上へ少し戻っても読み込みを待たせない */
const RECENT_DAYS = 7;

/** 週間天気の続きのページ（過ぎた日）の日数 */
const PAGE_DAYS = 14;

/**
 * 週間天気の 1 ページ（`HistoryPage`。日付順。1 日の形は `listWeatherDays`）。
 * before を省くと最新のページ（今日の 1 週間前から週間予報の終わりまで）、渡すとその日の前の 2 週間。
 * ページは日で区切るので、日の途中では切れない。nextCursor は、それより前に取っておいた日があるときの次の before
 * （取り始めた日より前は無い）。
 * WHY NOT 件数で区切る（立替・レモンの履歴のように）: 天気は 1 日 1 行で、日数で区切れば件数も決まる。
 */
export async function listWeatherPage(
  before: DateString | undefined,
  now: Date = new Date(),
): Promise<HistoryPage<WeatherDay>> {
  const from = before ? addDays(before, -PAGE_DAYS) : addDays(today(now), -RECENT_DAYS);
  const to = before ? addDays(before, -1) : addDays(today(now), FORECAST_DAYS - 1);
  const { items, hasEarlier } = await listWeatherDays({ from, to });
  return { items, nextCursor: hasEarlier ? from : null };
}

/**
 * [from, to]（両端を含む JST 暦日）の天気を日ごとに（日付順）。日ごとの天気に、祝日か（日付の色。カレンダーと同じ色分け）と、
 * その日の 3 時間ごとの天気と気温
 * （カレンダーと違い、同じ天気が続いてもまとめない。枠ごとに気温が違うため）と、6 時間ごとの降水確率を添える。
 * 表に無い天気の枠は、アイコンを決められないので除く（`listWeather` と同じ）。
 * 予報の無い日と表に無い天気の日は含まない（`listWeather`）。hasEarlier は from より前に取っておいた日があるか。
 * 手元の表を読むだけで、気象庁へは取りに行かない（`getCalendar` と同じ）。
 */
export async function listWeatherDays(
  range: DateRange,
): Promise<{ items: WeatherDay[]; hasEarlier: boolean }> {
  const [rows, holidays] = await Promise.all([repository.findDays(range), listHolidays(range)]);
  const holidaySet = new Set(holidays);
  const slots = Map.groupBy(
    rows.hourly.flatMap((row) => toSlot(row) ?? []),
    (slot) => slot.date,
  );
  const pops = Map.groupBy(rows.pops, ({ startsAt }) => toDateString(startsAt));
  return {
    items: toDaily(rows.daily).map((day) => ({
      ...day,
      holiday: holidaySet.has(day.date),
      slots: (slots.get(day.date) ?? []).map(({ date: _, ...slot }) => slot),
      pops: (pops.get(day.date) ?? []).map(({ startsAt, pop }) => ({
        startMin: minutesOfDay(startsAt),
        pop,
      })),
    })),
    hasEarlier: rows.hasEarlier,
  };
}
