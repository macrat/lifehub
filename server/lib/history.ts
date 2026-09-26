import {
  and,
  asc,
  type Column,
  desc,
  gte,
  ilike,
  lt,
  type SQL,
  type SQLWrapper,
  sql,
} from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { InstantRange } from '../../shared/date.ts';
import type { TimelineEntry } from '../../shared/timeline.ts';
import type { HistoryPage } from '../../shared/types.ts';
import { db } from './db.ts';

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
  before: string | undefined;
};

/**
 * 履歴の 1 ページ（shared/types.ts の `HistoryPage`）。before より前の、新しいほうから
 * HISTORY_PAGE_SIZE 件ほどを古い順で返す。最も古い日の途中では切らず、その日の行はすべて入れる。
 */
export async function findHistoryPage<T extends PgTable>({
  table,
  day,
  order,
  conditions,
  before,
}: PageQuery<T>): Promise<HistoryPage<T['$inferSelect']>> {
  const where = [...conditions, before !== undefined ? lt(day, before) : undefined];
  // 新しいほうから数えて HISTORY_PAGE_SIZE 件目の日。その日からをこのページにする
  const [boundary] = await db
    .select({ day: sql<string>`${day}::text` })
    .from(table as PgTable)
    .where(and(...where))
    .orderBy(desc(day), ...order.map((column) => desc(column)))
    .offset(HISTORY_PAGE_SIZE - 1)
    .limit(1);
  // このページの行と、それより前がまだあるかは互いに依らないので同時に聞く
  const [items, older] = await Promise.all([
    db
      .select()
      .from(table as PgTable)
      .where(and(...where, boundary && gte(day, boundary.day)))
      .orderBy(asc(day), ...order.map((column) => asc(column))),
    boundary
      ? db
          .select({ one: sql`1` })
          .from(table as PgTable)
          .where(and(...where, lt(day, boundary.day)))
          .limit(1)
      : [],
  ]);
  return {
    items: items as T['$inferSelect'][],
    nextCursor: boundary && older.length > 0 ? boundary.day : null,
  };
}

/**
 * タイムライン（`features/timeline`）が 1 つの feature から記録を集める口。各 feature の service が 1 つずつ持ち、
 * タイムラインはそれを並べるだけにする（どの記録をどの日時に置くかは各 feature と shared/timeline.ts が決める）。
 */
export type TimelineSource = {
  /** 置く日時が before より前の、新しいほうから（少なくとも）limit 件の日時（ページの区切りを決める）。並びは問わない */
  recentInstants(before: Date, q: string | undefined, limit: number): Promise<Date[]>;
  /** range に掛かる記録の行。どの行を出すかはタイムラインが行の日時で決める */
  entries(range: InstantRange, q: string | undefined, now: Date): Promise<TimelineEntry[]>;
};

/**
 * 1 件の記録が 1 つの日時に置かれる表の、タイムライン向けの問い合わせ（`TimelineSource` の元）。
 * at はタイムラインに置く日時の列か式、keyword はキーワードの条件（空のキーワードは undefined を返す）。
 */
export function timelineQueries<T extends PgTable>({
  table,
  at,
  keyword,
}: {
  table: T;
  at: SQL<Date> | Column;
  keyword: (q: string | undefined) => SQL | undefined;
}) {
  // 列も式も SQL として同じに扱える（どちらも Date に読み替えられる。式は mapWith で渡される）
  const instant = at as SQL<Date>;
  return {
    async findRecentInstants(before: Date, q: string | undefined, limit: number): Promise<Date[]> {
      const rows = await db
        .select({ at: instant })
        .from(table as PgTable)
        .where(and(lt(instant, before), keyword(q)))
        .orderBy(desc(instant))
        .limit(limit);
      return rows.map((row) => row.at);
    },
    async findInRange(range: InstantRange, q: string | undefined): Promise<T['$inferSelect'][]> {
      return db
        .select()
        .from(table as PgTable)
        .where(and(gte(instant, range.from), lt(instant, range.to), keyword(q)));
    },
  };
}

/**
 * キーワードの部分一致（大文字小文字を区別しない）。画面の検索窓と同じ規則で、
 * LIKE の記号（% と _）は文字として扱う。空のキーワードは条件にしない
 */
export function containsKeyword(column: Column, keyword: string | undefined): SQL | undefined {
  const q = keyword?.trim();
  return q ? ilike(column, `%${q.replace(/[\\%_]/g, '\\$&')}%`) : undefined;
}
