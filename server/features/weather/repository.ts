import { and, asc, eq, gte, lt, lte, sql } from 'drizzle-orm';
import { addDays, startOfDate } from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';
import { db, runBatch } from '../../lib/db.ts';
import { weather, weatherHourly } from './schema.ts';

export type WeatherRow = typeof weather.$inferSelect;
export type HourlyWeatherRow = typeof weatherHourly.$inferSelect;

/**
 * [from, to]（両端を含む JST 暦日）の日ごとの天気（日付順）と、その日々の 3 時間ごとの天気（時刻順）を
 * 1 回の往復で読む。
 */
export async function findBetween(
  from: DateString,
  to: DateString,
): Promise<{ daily: WeatherRow[]; hourly: HourlyWeatherRow[] }> {
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
        and(
          gte(weatherHourly.startsAt, startOfDate(from)),
          lt(weatherHourly.startsAt, startOfDate(addDays(to, 1))),
        ),
      )
      .orderBy(asc(weatherHourly.startsAt)),
  ]);
  return { daily, hourly };
}

/**
 * 日ごとに上書きする。渡さなかった日（予報から外れた過去の日）は残す。
 * 最高気温は null で上書きしない: 気象庁は日中を過ぎると今日の最高気温を報から外すので、
 * そのまま上書きすると、その日の気温が朝の予報ごと消えてしまう。
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
      },
    });
}

/**
 * その日の最高気温だけを上書きする（観測値で予報の値を置き換える）。行の無い日は何もしない:
 * 天気コードは観測からは取れず、コードの無い日はアイコンも出せないので、行を作っても使われない。
 */
export async function updateTempMax(
  date: DateString,
  tempMax: number,
): Promise<WeatherRow | undefined> {
  const [row] = await db.update(weather).set({ tempMax }).where(eq(weather.date, date)).returning();
  return row;
}

/** 時間帯ごとに上書きする。渡さなかった時間帯（予報から外れた、過ぎた時間帯）は残す */
export async function upsertHourly(rows: HourlyWeatherRow[]): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insert(weatherHourly)
    .values(rows)
    .onConflictDoUpdate({
      target: weatherHourly.startsAt,
      set: { weather: sql`excluded.weather` },
    });
}
