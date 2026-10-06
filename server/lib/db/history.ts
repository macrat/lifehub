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

/**
 * いくつかの表の記録を 1 本の履歴に並べるときの、1 つの表の問い合わせ（`server/lib/history-source.ts` の
 * `HistorySource` の元）。ページの区切りは記録の日（day。date 型の列）で、conditions は絞り込みの条件。
 * WHY 表ごとに問い合わせを分ける: 表をまたいで 1 文にすると、どの feature も他の feature の表を読むことになる。
 * 区切りを決める問い合わせと行を読む問い合わせはそれぞれ同じ時点に投げるので、往復は表の数に依らず 2〜3 回。
 */
export function historyQueries<T extends PgTable>({
  table,
  day,
  conditions,
}: {
  table: T;
  day: Column;
  conditions: (SQL | undefined)[];
}) {
  const where = (...more: (SQL | undefined)[]) => and(...conditions, ...more);
  return {
    /** before より前の、新しいほうから limit 件の記録の日（同じ日が並ぶ） */
    async recentDays(before: DateString | undefined, limit: number): Promise<DateString[]> {
      const rows = await db
        .select({ day: sql<DateString>`${day}::text` })
        .from(table as PgTable)
        .where(where(before !== undefined ? lt(day, before) : undefined))
        .orderBy(desc(day))
        .limit(limit);
      return rows.map((row) => row.day);
    },
    /** [from, before) の日の記録（from を省けば最も古い日から、before を省けば最も新しい日まで） */
    async findInDays(
      from: DateString | undefined,
      before: DateString | undefined,
    ): Promise<T['$inferSelect'][]> {
      return db
        .select()
        .from(table as PgTable)
        .where(
          where(
            from !== undefined ? sql`${day} >= ${from}` : undefined,
            before !== undefined ? lt(day, before) : undefined,
          ),
        );
    },
    /** day より前の日の記録があるか */
    async hasBefore(before: DateString): Promise<boolean> {
      const rows = await db
        .select({ one: sql`1` })
        .from(table as PgTable)
        .where(where(lt(day, before)))
        .limit(1);
      return rows.length > 0;
    },
  };
}
