import { z } from 'zod';
import type { DateString } from '../../../shared/types.ts';
import { dateStringSchema } from '../../../shared/validation/common.ts';
import type { DailyWeather } from '../../../shared/weather.ts';
import type { WeatherRow } from './repository.ts';
import * as repository from './repository.ts';
import { TELOPS } from './telops.ts';

/**
 * 気象庁の天気予報（東京都）。気象庁のサイトが自分の予報ページのために配っている JSON で、
 * 公式の API ではないが、キー不要で誰でも読める。1 日 3 回（5・11・17 時）更新される。
 * 1 つ目の報が今日から 3 日間の短期予報、2 つ目の報が明日から 7 日間の週間予報。
 */
const FORECAST_URL = 'https://www.jma.go.jp/bosai/forecast/data/forecast/130000.json';

/** 天気の地域: 東京地方（伊豆諸島・小笠原諸島を除く）。短期予報と週間予報で同じコードを使う */
const AREA_CODE = '130010';

/** 気温の地点: 東京（アメダスの地点コード）。短期予報と週間予報で同じコードを使う */
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

type Day = { code?: string; tempMax?: number };

/**
 * 予報の JSON から日ごとの天気コードと最高気温を取り出す（日付順。天気のある日だけ）。
 * 短期予報と週間予報が重なる日は、新しく細かい短期予報を採る。
 * 時刻は `+09:00` 付きで来るので、先頭 10 文字がそのまま JST の日付になる。
 * 短期予報の気温は最低（0 時）と最高（9 時）が時刻で分かれて並ぶので、9 時の値だけを最高気温として読む
 * （発表の時間帯によって今日の最低が抜けるなど並びが変わるので、位置では読まない）。
 * 週間予報の最高気温は日ごとに並び、予報の無い日（初日）は空文字になる。
 */
export function parseForecast(json: unknown): WeatherRow[] {
  const days = new Map<DateString, Day>();
  const put = (time: string, value: Day) => {
    const date = dateStringSchema.parse(time.slice(0, 10));
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
        const max = station?.tempsMax?.[i] || (time.slice(11, 13) === '09' && station?.temps?.[i]);
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

/**
 * 気象庁から取り直して予報のある日を上書きし、上書きした日数を返す（1 日 3 回の Cron）。
 * 取得や解析に失敗したら何も書かずに投げる（手元の天気は前回のまま残る）。
 */
export async function refreshWeather(): Promise<number> {
  const res = await fetch(FORECAST_URL);
  if (!res.ok) throw new Error(`weather: ${FORECAST_URL} returned ${res.status}`);
  const rows = parseForecast(await res.json());
  await repository.upsert(rows);
  return rows.length;
}

/**
 * 手元にある日ごとの天気（日付順）。過去の日は取っておいたすべて、先の日は予報のある日（最長 7 日先）まで。
 * まだ一度も取っていなければ（デプロイ直後など）その場で取ってから返す。
 * 表に無い天気コード（気象庁が新しく足したものなど）の日は、アイコンを決められないので返さない。
 */
export async function listWeather(): Promise<DailyWeather[]> {
  let rows = await repository.findAll();
  if (rows.length === 0) {
    await refreshWeather();
    rows = await repository.findAll();
  }
  return rows.flatMap(({ date, code, tempMax }) => {
    const telop = TELOPS[code];
    return telop ? [{ date, kind: telop[0], label: telop[1], tempMax }] : [];
  });
}
