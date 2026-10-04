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
import { listHolidays } from '../holidays/service.ts';
import {
  fetchForecast,
  fetchHourlyForecast,
  fetchMidnightObservation,
  SLOT_MINUTES,
} from './jma.ts';
import * as repository from './repository.ts';
import { HOURLY_SYMBOLS, TELOPS } from './telops.ts';

/**
 * 日ごとの天気と 6 時間ごとの降水確率を取り直して、予報のある日・区間を上書きする。上書きした日の数を返す。
 * どちらも同じ JSON に載っているので、1 回の取得で両方を書く。
 */
async function refreshDailyWeather(): Promise<number> {
  const { days, pops } = await fetchForecast();
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
  const { max, min } = await fetchMidnightObservation(today(now));
  return repository.updateTemps(addDays(today(now), -1), {
    ...(max !== null && { tempMax: Math.round(max) }),
    ...(min !== null && { tempMin: Math.round(min) }),
  });
}

/** 3 時間ごとの天気を取り直して、予報のある区間を上書きする。上書きした区間の数を返す */
async function refreshHourlyWeather(): Promise<number> {
  const rows = await fetchHourlyForecast();
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

/** [from, to]（両端を含む JST 暦日）の日ごとの天気だけ（日付順。表に無い天気の日は除く。`listWeather`） */
export async function listDailyWeather(range: DateRange): Promise<DailyWeather[]> {
  return toDaily(await repository.findDaily(range));
}

/**
 * [from, to]（両端を含む JST 暦日）の日ごとの天気（日付順）と 3 時間ごとの天気（時刻順）。
 * 過ぎた日は取っておいたすべて（その日・その区間の最後の予報）、先の日は予報のある所（日ごとは 7 日先、
 * 3 時間ごとは明日の終わり）まで。表に無い天気（気象庁が新しく足したものなど）は、アイコンを決められないので返さない。
 * 3 時間ごとの天気は、同じ日に間を空けずに続く同じ天気を 1 つの区間にまとめる（日をまたぐと分ける。`HourlyWeather`）。
 * 表に無い天気の区間は前後の区間ともつなげない。
 */
export async function listWeather(range: DateRange): Promise<WeatherInRange> {
  const [dailyRows, hourlyRows] = await Promise.all([
    repository.findDaily(range),
    repository.findHourly(range),
  ]);
  const daily = toDaily(dailyRows);
  const hourly: HourlyWeather[] = [];
  for (const row of hourlyRows) {
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
  // 前の日があるかはページの中身と関わらないので、並べて読む
  const [items, hasEarlier] = await Promise.all([
    listWeatherDays({ from, to }),
    repository.hasDaysBefore(from),
  ]);
  return { items, nextCursor: hasEarlier ? from : null };
}

/**
 * [from, to]（両端を含む JST 暦日）の天気を日ごとに（日付順）。日ごとの天気に、祝日か（日付の色。カレンダーと同じ色分け）と、
 * その日の 3 時間ごとの天気と気温
 * （カレンダーと違い、同じ天気が続いてもまとめない。枠ごとに気温が違うため）と、6 時間ごとの降水確率を添える。
 * 表に無い天気の枠は、アイコンを決められないので除く（`listWeather` と同じ）。
 * 予報の無い日と表に無い天気の日は含まない（`listWeather`）。
 * 手元の表を読むだけで、気象庁へは取りに行かない（カレンダーの `calendarLoader` と同じ）。
 */
export async function listWeatherDays(range: DateRange): Promise<WeatherDay[]> {
  const [dailyRows, hourlyRows, popRows, holidays] = await Promise.all([
    repository.findDaily(range),
    repository.findHourly(range),
    repository.findPops(range),
    listHolidays(range),
  ]);
  const holidaySet = new Set(holidays);
  const slots = Map.groupBy(
    hourlyRows.flatMap((row) => toSlot(row) ?? []),
    (slot) => slot.date,
  );
  const pops = Map.groupBy(popRows, ({ startsAt }) => toDateString(startsAt));
  return toDaily(dailyRows).map((day) => ({
    ...day,
    holiday: holidaySet.has(day.date),
    slots: (slots.get(day.date) ?? []).map(({ date: _, ...slot }) => slot),
    pops: (pops.get(day.date) ?? []).map(({ startsAt, pop }) => ({
      startMin: minutesOfDay(startsAt),
      pop,
    })),
  }));
}
