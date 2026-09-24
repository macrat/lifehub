import { asc, eq, gte, lt, sql } from 'drizzle-orm';
import type { DateString } from '../../../shared/types.ts';
import { db, runBatch } from '../../lib/db.ts';
import { weather, weatherHourly } from './schema.ts';

export type WeatherRow = typeof weather.$inferSelect;
export type HourlyWeatherRow = typeof weatherHourly.$inferSelect;

export async function findAll(): Promise<WeatherRow[]> {
  return db.select().from(weather).orderBy(asc(weather.date));
}

/**
 * 日ごとに上書きする。渡さなかった日（予報から外れた過去の日）は残す。
 * 最高気温は null で上書きしない: 気象庁は日中を過ぎると今日の最高気温を報から外すので、
 * そのまま上書きすると、その日の気温が朝の予報ごと消えてしまう。
 */
export async function upsert(rows: WeatherRow[]): Promise<void> {
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

/** `from` 以降の 3 時間ごとの天気（時刻順） */
export async function findHourlyFrom(from: Date): Promise<HourlyWeatherRow[]> {
  return db
    .select()
    .from(weatherHourly)
    .where(gte(weatherHourly.startsAt, from))
    .orderBy(asc(weatherHourly.startsAt));
}

/**
 * 時間帯ごとに上書きし、`before` より前の行を消す。渡さなかった `before` 以降の時間帯（予報から外れた、
 * 今日の過ぎた時間帯）は残す。取り直しの途中で読まれても、前の天気か新しい天気のどちらかが見える。
 */
export async function upsertHourly(rows: HourlyWeatherRow[], before: Date): Promise<void> {
  await runBatch((tx) => [
    tx.delete(weatherHourly).where(lt(weatherHourly.startsAt, before)),
    ...(rows.length > 0
      ? [
          tx
            .insert(weatherHourly)
            .values(rows)
            .onConflictDoUpdate({
              target: weatherHourly.startsAt,
              set: { weather: sql`excluded.weather` },
            }),
        ]
      : []),
  ]);
}
