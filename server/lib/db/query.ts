import {
  and,
  type Column,
  eq,
  exists,
  getTableColumns,
  ilike,
  inArray,
  notExists,
  type SQL,
  sql,
} from 'drizzle-orm';
import { alias, type PgColumn, type PgTable } from 'drizzle-orm/pg-core';
import { TIME_ZONE } from '../../../shared/constants.ts';
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
 * JST の暦日（date 型の列）の始まりの瞬間。shared/date.ts の `startOfDate` の SQL 版で、日付しか持たない記録を
 * タイムラインに置く日時を、画面が置く位置（shared/timeline.ts）と同じ式で DB でも出すのに使う
 */
export function startOfDateSql(column: Column): SQL<Date> {
  return sql<Date>`${column}::timestamp at time zone ${TIME_ZONE}`;
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
 * ID の順に並べる。WHY: 並びを指定しない array_agg は実行計画で順が変わり、同じ行が読むたびに違う配列になる。
 */
function idArrayAgg(column: PgColumn): SQL<string[]> {
  return sql`coalesce(array_agg(${column}::text order by ${column}) filter (where ${column} is not null), '{}')`;
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
  const existing = inserted ?? (await findById(table, row.id));
  if (!existing) throw new Error('insert returned no row');
  return existing;
}

/** id の行（無ければ undefined） */
export async function findById<T extends TableWithId>(
  table: T,
  id: string,
): Promise<T['$inferSelect'] | undefined> {
  // select の from は総称の表を受けないので、ここだけ具体的な表の型に広げる
  const [row] = await db
    .select()
    .from(table as TableWithId)
    .where(eq(table.id, id))
    .limit(1);
  return row;
}

/**
 * id の行の項目を置き換え、書いた後の行を返す（無ければ undefined）。
 * where を渡すと、それにも合う行だけを書く（持ち主の行だけ、手で入れた行だけ）
 */
export async function updateById<T extends TableWithId>(
  table: T,
  id: string,
  values: Partial<T['$inferInsert']>,
  where?: SQL,
): Promise<T['$inferSelect'] | undefined> {
  // update の set は総称の表から項目の型を導けないので、ここだけ具体的な表の型に広げる
  const [row] = await db
    .update(table as TableWithId)
    .set(values)
    .where(and(eq(table.id, id), where))
    .returning();
  return row as T['$inferSelect'] | undefined;
}

/** id の行を消し、消した行を返す（無ければ undefined）。where は `updateById` と同じ */
export async function deleteById<T extends TableWithId>(
  table: T,
  id: string,
  where?: SQL,
): Promise<T['$inferSelect'] | undefined> {
  const [row] = await db
    .delete(table as TableWithId)
    .where(and(eq(table.id, id), where))
    .returning();
  return row as T['$inferSelect'] | undefined;
}

/** 別名を付けた総称の表と、その列を名前で引く関数（総称の表の別名は、列を名前で引けると型に出ない） */
function columnsOf(table: PgTable) {
  const columns = table as unknown as Record<string, PgColumn>;
  return {
    table,
    column: (name: string): PgColumn => {
      const column = columns[name];
      if (!column) throw new Error(`no column: ${name}`);
      return column;
    },
  };
}

/**
 * 参加者（親の行とユーザーの多対多）を読み書きする問い合わせの組。予定（events）と配信 URL（calendar_feeds）が
 * 同じ形で使う。親と参加者の表の結びつけ方（どの列で結ぶか・ID の配列へのまとめ方）をここだけに書く。
 * 書く文はどれも親の行を where で引き当てて書くので、ID を手元に持たない条件（回の実体化）でも、
 * 持ち主などの条件を足した書き込み（他人の行には入らない）でも、親の行と同じ runBatch に入れて原子的に書ける。
 */
export function participantsOf<
  T extends TableWithId,
  P extends PgTable & { userId: PgColumn },
  K extends keyof P & string,
>({
  parent,
  participants,
  parentKey,
}: {
  /** 親の表 */
  parent: T;
  /** 参加者の表（親を指す列と `userId` 列を持つ） */
  participants: P;
  /** 参加者の表で親を指す列の名前（表に無い名前は型で止まる） */
  parentKey: K;
}) {
  // 列は表のオブジェクトに列の名前で載っている
  const parentColumn = participants[parentKey] as PgColumn;
  // from・join は総称の表を受けないので、文を組むところでは具体的な表の型に広げる
  // （読んだ行の型は select に並べた parent の列から決まるので、広げても失われない）
  const parentTable: TableWithId = parent;
  const participantsTable: PgTable = participants;

  /** where に合う親の行（1 行）に userIds を参加者として入れる文 */
  const insertWhere = (tx: Database, where: SQL | undefined, userIds: string[]) =>
    tx.insert(participants).select(
      // 親を指す列の名前は表ごとに違うので、Drizzle は select の形を insert の形と照らし合わせられない
      tx
        .select({ [parentKey]: parent.id, userId: unnestIds(userIds, 'user_id') })
        .from(parentTable)
        .where(where) as never,
    );

  /** where に合う親の行（1 行）の参加者を userIds に置き換える 2 文（消して入れ直す） */
  const replaceWhere = (tx: Database, where: SQL | undefined, userIds: string[]) =>
    [
      tx
        .delete(participants)
        .where(inArray(parentColumn, tx.select({ id: parent.id }).from(parentTable).where(where))),
      insertWhere(tx, where, userIds),
    ] as const;

  /**
   * 親の行に参加者の ID の配列（`participantIds`）を添えて読む select。参加者が 0 人でも行は消えない。
   * 行ごとにまとめるので、呼ぶ側が親の id で group by する。
   * 参加者は常に行と一緒に読む（別の問い合わせにすると往復が増えるだけで得が無い）。
   */
  const selectWithParticipants = () =>
    db
      .select({ ...getTableColumns(parent), participantIds: idArrayAgg(participants.userId) })
      .from(parentTable)
      .leftJoin(participantsTable, eq(parentColumn, parent.id));

  /** 今の親の行の参加者の ID の配列（副問い合わせ。update の returning などで行と一緒に返す） */
  const participantIdsOfRow = () =>
    sql<
      string[]
    >`(select ${idArrayAgg(participants.userId)} from ${participants} where ${parentColumn} = ${parent.id})`;

  /**
   * 外側の問い合わせの親の行の参加者（userId を渡せばその人だけ）を読む副問い合わせ。
   * 外側の FROM に参加者の表が並んでいても混ざらないよう別名で読む
   */
  const participantsOfOuterRow = (tx: Database, userId?: string) => {
    const own = columnsOf(alias(participantsTable, 'own_participants'));
    return tx
      .select({ one: sql`1` })
      .from(own.table)
      .where(
        and(
          eq(own.column(parentKey), parent.id),
          userId === undefined ? undefined : eq(own.column('userId'), userId),
        ),
      );
  };

  /** 親の行が参加者を 1 人も持たない（参加者は 1 人以上なので、真なのは参加者を入れる前だけ） */
  const hasNone = (tx: Database): SQL => notExists(participantsOfOuterRow(tx));

  /** 親の行の参加者に userId がいる */
  const has = (userId: string): SQL => exists(participantsOfOuterRow(db, userId));

  /**
   * where に合う親の行が参加者を持たなければ、sourceParent の列が指す別の親の行の参加者を写す文
   * （繰り返しの回を実体化したとき、繰り返し元の参加者を写す）
   */
  const copyWhere = (tx: Database, where: SQL | undefined, sourceParent: PgColumn) => {
    const source = columnsOf(alias(participantsTable, 'source_participants'));
    return tx.insert(participants).select(
      tx
        .select({ [parentKey]: parent.id, userId: source.column('userId') })
        .from(parentTable)
        .innerJoin(source.table, eq(source.column(parentKey), sourceParent))
        .where(and(where, hasNone(tx))) as never,
    );
  };

  return {
    insertWhere,
    replaceWhere,
    copyWhere,
    selectWithParticipants,
    participantIdsOfRow,
    hasNone,
    has,
  };
}
