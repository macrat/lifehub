import { and, asc, gte, lte } from 'drizzle-orm';
import type { DateRange } from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';
import { db, runBatch } from '../../lib/db/client.ts';
import { holidays } from './schema.ts';

/** [from, to]（両端含む）の祝日（昇順） */
export async function findInRange({ from, to }: DateRange): Promise<DateString[]> {
  const rows = await db
    .select()
    .from(holidays)
    .where(and(gte(holidays.date, from), lte(holidays.date, to)))
    .orderBy(asc(holidays.date));
  return rows.map((row) => row.date);
}

/** 全行を入れ替える。取り直しの途中で読まれても、古い一覧か新しい一覧のどちらかが見える */
export async function replaceAll(dates: DateString[]): Promise<void> {
  await runBatch((tx) => [
    tx.delete(holidays),
    ...(dates.length > 0 ? [tx.insert(holidays).values(dates.map((date) => ({ date })))] : []),
  ]);
}
