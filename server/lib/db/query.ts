import { type Column, eq, ilike, inArray, type SQL, sql } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { type Database, db } from './client.ts';

/**
 * repository が使う問い合わせの部品。どの feature の表にも同じ形で当てはまるものだけを置く。
 */

/**
 * キーワードの部分一致（大文字小文字を区別しない）。画面の検索窓と同じ規則で、
 * LIKE の記号（% と _）は文字として扱う。空のキーワードは条件にしない
 */
export function containsKeyword(column: Column, keyword: string | undefined): SQL | undefined {
  const q = keyword?.trim();
  return q ? ilike(column, `%${q.replace(/[\\%_]/g, '\\$&')}%`) : undefined;
}

/**
 * ID の配列を 1 行に 1 つずつ展開する列（`insert ... select` で子テーブルの行を作るのに使う）。
 * 親の行を where で引き当てて select し、その行ごとに ID の数だけ行を作る。親の ID を手元に持たない書き込み
 * （回の実体化）や、「親を作れたときだけ」入れる書き込み（where に条件を足す）で、親の行と同じ batch に入れられる。
 */
function unnestIds(ids: string[], alias: string): SQL.Aliased<string> {
  return sql<string>`unnest(${sql.param(ids)}::uuid[])`.as(alias);
}

/**
 * 結合した子テーブルの ID を配列にまとめる（参加者のような多対多の相手）。
 * left join と組にすると、子が 0 件でも親の行が消えない。
 * uuid[] のままだとドライバによって受け取り方が変わるので text[] にして返す。
 */
export function idArrayAgg(column: PgColumn): SQL<string[]> {
  return sql`coalesce(array_agg(${column}::text) filter (where ${column} is not null), '{}')`;
}

/** `id` 列を主キーに持つ表 */
type TableWithId = PgTable & { id: PgColumn };

/**
 * 記録を 1 行作り、その行を返す。id は呼び出し元（多くはクライアント）が決めたもの。
 * 同じ id で送り直されたら（オフラインで溜めた書き込みの再送）何も書かず、今の行を返す（二重に作らない）。
 * WHY NOT 送られた値で上書き: 作った後に編集してから古い作成が再送されると、編集が巻き戻る。
 * 再送の目的は二重作成を防ぐことだけなので、既にあれば手を触れない。
 */
export async function insertOnce<T extends TableWithId>(
  table: T,
  row: T['$inferInsert'] & { id: string },
): Promise<T['$inferSelect']> {
  const [inserted] = await db.insert(table).values(row).onConflictDoNothing().returning();
  if (inserted) return inserted;
  // select の from は総称の表を受けないので、ここだけ具体的な表の型に広げる
  const [existing] = await db
    .select()
    .from(table as TableWithId)
    .where(eq(table.id, row.id))
    .limit(1);
  if (!existing) throw new Error('insert returned no row');
  return existing;
}

/**
 * 参加者（親の行とユーザーの多対多）を書く文の組。予定（events）と配信 URL（calendar_feeds）が同じ形で使う。
 * どの文も親の行を where で引き当てて書くので、ID を手元に持たない条件（回の実体化）でも、
 * 持ち主などの条件を足した書き込み（他人の行には入らない）でも、親の行と同じ runBatch に入れて原子的に書ける。
 */
export function participantWrites<
  P extends PgTable & { userId: PgColumn },
  K extends keyof P['$inferInsert'] & string,
>({
  parent,
  participants,
  parentKey,
}: {
  /** 親の表 */
  parent: TableWithId;
  /** 参加者の表（親を指す列と `userId` 列を持つ） */
  participants: P;
  /** 参加者の表で親を指す列の名前（表に無い名前は型で止まる） */
  parentKey: K;
}) {
  // 列は表のオブジェクトに列の名前で載っている（K が表の列の名前であることは型が保証する）
  const parentColumn = participants[parentKey as keyof P] as PgColumn;

  /** where に合う親の行（1 行）に userIds を参加者として入れる文 */
  const insertWhere = (tx: Database, where: SQL | undefined, userIds: string[]) =>
    tx.insert(participants).select(
      // 親を指す列の名前は表ごとに違うので、Drizzle は select の形を insert の形と照らし合わせられない
      tx
        .select({ [parentKey]: parent.id, userId: unnestIds(userIds, 'user_id') })
        .from(parent)
        .where(where) as never,
    );

  /** where に合う親の行（1 行）の参加者を userIds に置き換える 2 文（消して入れ直す） */
  const replaceWhere = (tx: Database, where: SQL | undefined, userIds: string[]) =>
    [
      tx
        .delete(participants)
        .where(inArray(parentColumn, tx.select({ id: parent.id }).from(parent).where(where))),
      insertWhere(tx, where, userIds),
    ] as const;

  return { insertWhere, replaceWhere };
}
