import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import type { DateRange } from '../../../shared/calendar.ts';
import type { DateString } from '../../../shared/types.ts';
import { db } from '../../lib/db.ts';
import { weather } from './schema.ts';

export type WeatherRow = typeof weather.$inferSelect;

/** [from, to]（両端含む）の天気（日付順） */
export async function findInRange({ from, to }: DateRange): Promise<WeatherRow[]> {
  return db
    .select()
    .from(weather)
    .where(and(gte(weather.date, from), lte(weather.date, to)))
    .orderBy(asc(weather.date));
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
