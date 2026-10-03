import { and, type Column, desc, gte, lt, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { InstantRange } from '../../../shared/date.ts';
import { db } from './client.ts';

/**
 * 1 件の記録が 1 つの日時に置かれる表の、タイムライン向けの問い合わせ（`TimelineSource` の元）。
 * at はタイムラインに置く日時の列か式、keyword はキーワードの条件（空のキーワードは undefined を返す）、
 * where はキーワードに関わらずいつも掛ける条件（省けば表のすべての行）。
 */
export function timelineQueries<T extends PgTable>({
  table,
  at,
  keyword,
  where,
}: {
  table: T;
  at: SQL<Date> | Column;
  keyword: (q: string | undefined) => SQL | undefined;
  where?: SQL;
}) {
  // 列も式も SQL として同じに扱える（どちらも Date に読み替えられる。式は mapWith で渡される）
  const instant = at as SQL<Date>;
  return {
    async findRecentInstants(before: Date, q: string | undefined, limit: number): Promise<Date[]> {
      const rows = await db
        .select({ at: instant })
        .from(table as PgTable)
        .where(and(lt(instant, before), keyword(q), where))
        .orderBy(desc(instant))
        .limit(limit);
      return rows.map((row) => row.at);
    },
    async findInRange(range: InstantRange, q: string | undefined): Promise<T['$inferSelect'][]> {
      return db
        .select()
        .from(table as PgTable)
        .where(and(gte(instant, range.from), lt(instant, range.to), keyword(q), where));
    },
  };
}
