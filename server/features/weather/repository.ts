import { and, asc, eq, gte, lt, lte, sql } from 'drizzle-orm';
import { type DateRange, instantRange } from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';
import { db, runBatch } from '../../lib/db/client.ts';
import { weather, weatherHourly, weatherPop } from './schema.ts';

export type WeatherRow = typeof weather.$inferSelect;
export type HourlyWeatherRow = typeof weatherHourly.$inferSelect;
export type PopRow = typeof weatherPop.$inferSelect;

/**
 * [from, to]（両端を含む JST 暦日）の日ごとの天気（日付順）と、その日々の 3 時間ごとの天気（時刻順）を
 * 1 回の往復で読む。
 */
export async function findBetween(
  range: DateRange,
): Promise<{ daily: WeatherRow[]; hourly: HourlyWeatherRow[] }> {
  const { from, to } = range;
  const instants = instantRange(range);
  const [daily, hourly] = await runBatch((tx) => [
    tx
      .select()
      .from(weather)
      .where(and(gte(weather.date, from), lte(weather.date, to)))
      .orderBy(asc(weather.date)),
    tx
      .select()
      .from(weatherHourly)
      .where(
        and(gte(weatherHourly.startsAt, instants.from), lt(weatherHourly.startsAt, instants.to)),
      )
      .orderBy(asc(weatherHourly.startsAt)),
  ]);
  return { daily, hourly };
}

/**
 * 天気の画面の 1 ページ分（[from, to]。両端を含む JST 暦日）を 1 回の往復で読む: 日ごとの天気（日付順）、
 * 3 時間ごとの天気（時刻順）、6 時間ごとの降水確率（時刻順）と、from より前に取っておいた日があるか。
 */
export async function findDays(range: DateRange): Promise<{
  daily: WeatherRow[];
  hourly: HourlyWeatherRow[];
  pops: PopRow[];
  hasEarlier: boolean;
}> {
  const instants = instantRange(range);
  const [daily, hourly, pops, earlier] = await runBatch((tx) => [
    tx
      .select()
      .from(weather)
      .where(and(gte(weather.date, range.from), lte(weather.date, range.to)))
      .orderBy(asc(weather.date)),
    tx
      .select()
      .from(weatherHourly)
      .where(
        and(gte(weatherHourly.startsAt, instants.from), lt(weatherHourly.startsAt, instants.to)),
      )
      .orderBy(asc(weatherHourly.startsAt)),
    tx
      .select()
      .from(weatherPop)
      .where(and(gte(weatherPop.startsAt, instants.from), lt(weatherPop.startsAt, instants.to)))
      .orderBy(asc(weatherPop.startsAt)),
    tx.select({ date: weather.date }).from(weather).where(lt(weather.date, range.from)).limit(1),
  ]);
  return { daily, hourly, pops, hasEarlier: earlier.length > 0 };
}

/**
 * 日ごとに上書きする。渡さなかった日（予報から外れた過去の日）は残す。
 * 気温と降水確率は null で上書きしない: 気象庁は日中を過ぎると今日の最高気温を、夜には今日の降水確率を
 * 報から外すので、そのまま上書きすると、その日の値が前の予報ごと消えてしまう。
 */
export async function upsertDaily(rows: WeatherRow[]): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insert(weather)
    .values(rows)
    .onConflictDoUpdate({
      target: weather.date,
      set: {
        code: sql`excluded.code`,
        tempMax: sql`coalesce(excluded.temp_max, ${weather.tempMax})`,
        tempMin: sql`coalesce(excluded.temp_min, ${weather.tempMin})`,
        pop: sql`coalesce(excluded.pop, ${weather.pop})`,
      },
    });
}

/**
 * その日の気温だけを上書きする（観測値で予報の値を置き換える）。渡さなかった方は残す。行の無い日は何もしない:
 * 天気コードは観測からは取れず、コードの無い日はアイコンも出せないので、行を作っても使われない。
 */
export async function updateTemps(
  date: DateString,
  temps: { tempMax?: number; tempMin?: number },
): Promise<WeatherRow | undefined> {
  const [row] = await db.update(weather).set(temps).where(eq(weather.date, date)).returning();
  return row;
}

/**
 * 時間帯ごとに上書きする。渡さなかった時間帯（予報から外れた、過ぎた時間帯）は残す。
 * 気温は null で上書きしない（気温の載っていない報で、前の予報の気温を消さない）
 */
export async function upsertHourly(rows: HourlyWeatherRow[]): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insert(weatherHourly)
    .values(rows)
    .onConflictDoUpdate({
      target: weatherHourly.startsAt,
      set: {
        weather: sql`excluded.weather`,
        temp: sql`coalesce(excluded.temp, ${weatherHourly.temp})`,
      },
    });
}

/** 6 時間ごとの降水確率を区間ごとに上書きする。渡さなかった区間（過ぎた区間）は残す */
export async function upsertPops(rows: PopRow[]): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insert(weatherPop)
    .values(rows)
    .onConflictDoUpdate({ target: weatherPop.startsAt, set: { pop: sql`excluded.pop` } });
}
