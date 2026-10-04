import {
  and,
  asc,
  type Column,
  desc,
  getTableColumns,
  lt,
  type SQL,
  type SQLWrapper,
  sql,
} from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { DateString, HistoryPage } from '../../../shared/types.ts';
import { db } from './client.ts';

/**
 * 履歴（立替・レモンの記録）の 1 ページの件数の目安。ページは日の途中では切らないので、
 * これより多くなることがある。1 日は数件なので、スマホの画面数枚分になる
 */
const HISTORY_PAGE_SIZE = 50;

type PageQuery<T extends PgTable> = {
  table: T;
  /** 行の日（JST の暦日。date 型の列か式）。ページはこの日で区切る */
  day: SQLWrapper;
  /** 同じ日の中の並び（古い順に並べる列。最後は一意な列にする） */
  order: Column[];
  /** 絞り込みの条件（undefined は条件にしない） */
  conditions: (SQL | undefined)[];
  /** この日より前を読む（省けば最新のページ） */
  before: DateString | undefined;
};

/**
 * 履歴の 1 ページ（shared/types.ts の `HistoryPage`）。before より前の、新しいほうから
 * HISTORY_PAGE_SIZE 件ほどを古い順で返す。最も古い日の途中では切らず、その日の行はすべて入れる。
 *
 * 問い合わせは 1 回にする（HTTP のドライバでは往復の回数が応答時間を決める。docs/architecture.md）。
 * ページの境目の日（新しいほうから数えて HISTORY_PAGE_SIZE 件目の日）は CTE で 1 度だけ求め、
 * 行の範囲・境目の値・それより前がまだあるかの 3 か所から読む（同じ副問い合わせを 3 回書くと、
 * Postgres は別々に 3 回評価する。2 回以上読む CTE は 1 度だけ実体化される）。
 */
export async function findHistoryPage<T extends PgTable>({
  table,
  day,
  order,
  conditions,
  before,
}: PageQuery<T>): Promise<HistoryPage<T['$inferSelect']>> {
  const where = and(...conditions, before !== undefined ? lt(day, before) : undefined);
  const boundary = db.$with('boundary').as(
    db
      .select({ day: sql`${day}`.as('day') })
      .from(table as PgTable)
      .where(where)
      .orderBy(desc(day), ...order.map((column) => desc(column)))
      .offset(HISTORY_PAGE_SIZE - 1)
      .limit(1),
  );
  const boundaryDay = sql`(select ${boundary.day} from ${boundary})`;
  const rows = await db
    .with(boundary)
    .select({
      ...getTableColumns(table as PgTable),
      // date 型を text にした値は必ず YYYY-MM-DD
      pageBoundary: sql<DateString | null>`${boundaryDay}::text`,
      hasOlder: sql<boolean>`exists (${db
        .select({ one: sql`1` })
        .from(table as PgTable)
        .where(and(where, sql`${day} < ${boundaryDay}`))})`,
    })
    .from(table as PgTable)
    // 境目の日が無い（残りが HISTORY_PAGE_SIZE 件に満たない）なら、残りすべてがこのページ
    .where(and(where, sql`${day} >= coalesce(${boundaryDay}, '-infinity'::date)`))
    .orderBy(asc(day), ...order.map((column) => asc(column)));
  const [first] = rows;
  return {
    items: rows.map(({ pageBoundary: _, hasOlder: __, ...row }) => row) as T['$inferSelect'][],
    nextCursor: first?.pageBoundary && first.hasOlder ? first.pageBoundary : null,
  };
}
