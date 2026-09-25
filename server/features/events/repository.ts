import {
  and,
  desc,
  eq,
  getTableColumns,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  not,
  notExists,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import { alias, type PgColumn } from 'drizzle-orm/pg-core';
import { newId } from '../../../shared/id.ts';
import { type Database, db, idArrayAgg, runBatch, unnestIds } from '../../lib/db.ts';
import { containsKeyword } from '../../lib/history.ts';
import { type EventRow, eventParticipants, events, type NewEventRow } from './schema.ts';

/** 行と参加者。参加者は常に行と一緒に読む（別の問い合わせにすると往復が増えるだけで得が無い） */
export type EventWithParticipants = EventRow & { participantIds: string[] };

/** 参加者を配列にまとめた行を読む（`idArrayAgg`。参加者が 0 人でも行は消えない） */
function selectRows() {
  return db
    .select({
      ...getTableColumns(events),
      participantIds: idArrayAgg(eventParticipants.userId),
    })
    .from(events)
    .leftJoin(eventParticipants, eq(eventParticipants.eventId, events.id));
}

/** 条件に合う行を 1 つ、参加者と一緒に読む */
async function findOne(where: SQL | undefined): Promise<EventWithParticipants | undefined> {
  const rows = await selectRows().where(where).groupBy(events.id).limit(1);
  return rows[0];
}

/**
 * [from, to) に発生を持ちうる繰り返し元・単発の行を選ぶ条件。
 * ここでの絞り込みは「読む量を減らすための粗いふるい」で、範囲との厳密な重なりは展開後に判定する。
 */
type CandidateColumns = Record<
  'seriesId' | 'rrule' | 'kind' | 'startsAt' | 'endsAt' | 'completedAt' | 'title' | 'note',
  PgColumn
>;

/** 検索（ホームのタイムライン）: タイトルかメモの部分一致。空のキーワードは条件にしない */
function keywordOf(table: Pick<CandidateColumns, 'title' | 'note'>, q: string | undefined) {
  return or(containsKeyword(table.title, q), containsKeyword(table.note, q));
}

function isCandidate(
  table: CandidateColumns,
  from: Date,
  to: Date,
  q: string | undefined,
): SQL | undefined {
  const base = sql`coalesce(${table.startsAt}, ${table.endsAt})`;
  return and(
    keywordOf(table, q),
    // 実体化された回は候補にしない（繰り返し元をたどって別に読む）
    isNull(table.seriesId),
    or(
      // 繰り返し元: 基準日時が範囲の終わりより前なら、回が範囲に入りうる
      and(isNotNull(table.rrule), lt(base, to)),
      // 単発の未完了タスク: 完了するまで「今日」に繰り越されるので、日時では絞れない
      and(isNull(table.rrule), eq(table.kind, 'task'), isNull(table.completedAt)),
      // 単発の完了したタスク: 完了した日にだけ置かれる
      and(
        isNull(table.rrule),
        eq(table.kind, 'task'),
        gte(table.completedAt, from),
        lt(table.completedAt, to),
      ),
      // 単発の予定: 期間と重なるもの
      and(
        isNull(table.rrule),
        eq(table.kind, 'event'),
        lt(table.startsAt, to),
        gt(table.endsAt, from),
      ),
    ),
  );
}

/**
 * 繰り返し元・単発の行を ID で読む。実体化された回の行（series_id を持つ）は返さない。
 * クライアントと MCP が指す ID は常に繰り返し元のもの（回は繰り返し元の ID と occurrenceStart で指す）で、
 * 回の行は rrule を持たないので、返すと単発として扱われ、「すべて」の削除で回の行が消えて
 * 取り消した回が復活する、といった繰り返し元を通さない書き込みになってしまう。
 */
export async function findMasterById(id: string): Promise<EventWithParticipants | undefined> {
  return findOne(and(eq(events.id, id), isNull(events.seriesId)));
}

/** 実体化された回の行（無ければ undefined。その回はルールどおりで、繰り返し元をずらした値になる） */
export async function findOccurrence(
  seriesId: string,
  occurrenceStart: Date,
): Promise<EventWithParticipants | undefined> {
  return findOne(and(eq(events.seriesId, seriesId), eq(events.occurrenceStart, occurrenceStart)));
}

/**
 * カレンダーの組み立てに要る行をまとめて読む: [from, to) に発生を持ちうる繰り返し元・単発と、
 * それらに属する実体化された回。1 回の問い合わせで済ませる（Neon の HTTP ドライバでは
 * 問い合わせ 1 回が往復 1 回なので、回数がそのまま応答時間になる）。
 * q を渡すと、タイトルかメモが当たる繰り返し元・単発だけを読む（ホームのタイムラインの検索。
 * 当たらない繰り返しを展開してから捨てずに済む）。
 */
export async function findCalendarRows(
  from: Date,
  to: Date,
  q?: string,
): Promise<EventWithParticipants[]> {
  const master = alias(events, 'master');
  return selectRows()
    .where(
      or(
        isCandidate(events, from, to, q),
        inArray(
          events.seriesId,
          db
            .select({ id: master.id })
            .from(master)
            .where(isCandidate(master, from, to, q)),
        ),
      ),
    )
    .groupBy(events.id)
    .orderBy(events.startsAt, events.createdAt);
}

/**
 * タイムラインで行を置く日時: 予定は開始、タスクは完了した日時（shared/timeline.ts の `eventEntry`）。
 * 未完了のタスクは一番上にまとめるか（開始を過ぎた・日時が無い）、24 時間以内の開始の位置にしか出ないので、
 * ページの区切りを決めるのには数えない（null はどの比較にも当たらない）。
 * 繰り返し元は回ごとに日時が違うので、この式を使うのは単発の行と実体化された回（どちらも rrule を持たない）だけ。
 */
const timelineAt = sql<Date>`case
  when ${events.kind} = 'event' then ${events.startsAt}
  else ${events.completedAt}
end`.mapWith(events.startsAt);

/**
 * 単発の行と実体化された回（取り消した回を除く）のうち、タイムラインの日時が before より前の、
 * 新しいほうから limit 件の日時（タイムラインのページ分け）。繰り返し元の回は `findRecurringEventsBefore` から展開する
 */
export async function findRecentTimelineInstants(
  before: Date,
  q: string | undefined,
  limit: number,
): Promise<Date[]> {
  const rows = await db
    .select({ at: timelineAt })
    .from(events)
    .where(
      and(
        isNull(events.rrule),
        not(events.cancelled),
        lt(timelineAt, before),
        keywordOf(events, q),
      ),
    )
    .orderBy(desc(timelineAt))
    .limit(limit);
  return rows.map((row) => row.at);
}

/**
 * before より前に回を持つ、繰り返す予定の繰り返し元（タイムラインのページ分けで回を展開する）。
 * 繰り返すタスクの回は、完了した回が実体化された行として `findRecentTimelineInstants` に入り、
 * 未完了の回は今に近い 2 つしか出ない（docs/features/events.md）ので、ページ分けには含めない。
 */
export async function findRecurringEventsBefore(
  before: Date,
  q: string | undefined,
): Promise<{ rrule: string; startsAt: Date }[]> {
  const rows = await db
    .select({ rrule: events.rrule, startsAt: events.startsAt })
    .from(events)
    .where(
      and(
        isNotNull(events.rrule),
        eq(events.kind, 'event'),
        lt(events.startsAt, before),
        keywordOf(events, q),
      ),
    );
  return rows.flatMap(({ rrule, startsAt }) => (rrule && startsAt ? [{ rrule, startsAt }] : []));
}

/**
 * 行と参加者を原子的に作る。id は呼び出し元（多くはクライアント）が決めたもの。
 * 同じ id で送り直されたら（オフラインで溜めた書き込みの再送）何も書かない（二重に作らない）。
 * WHY NOT 送られた値で上書き: 作った後に編集してから古い作成が再送されると、編集が巻き戻る。
 * 参加者も、行が参加者を持たないとき（この文で作ったばかりの行）だけ入れる。行が既にあるのに
 * 参加者だけ足すと、編集で外した人が戻ってしまう（参加者は 1 人以上なので 0 人は作る前だけ）。
 */
export async function insert(row: NewEventRow, participantIds: string[]): Promise<void> {
  await runBatch((tx) => [
    tx.insert(events).values(row).onConflictDoNothing(),
    insertParticipantsWhere(tx, and(eq(events.id, row.id), hasNoParticipants(tx)), participantIds),
  ]);
}

/**
 * 行を更新する。participantIds を渡すと参加者を置き換える。
 * dropOccurrences を立てると、実体化された未完了の回も同じ原子的な操作の中で消す。
 */
export async function update(
  id: string,
  values: Partial<NewEventRow>,
  options: { participantIds?: string[]; dropUncompletedOccurrences?: boolean } = {},
): Promise<void> {
  const { participantIds, dropUncompletedOccurrences } = options;
  if (participantIds === undefined && !dropUncompletedOccurrences) {
    await db.update(events).set(values).where(eq(events.id, id));
    return;
  }
  await runBatch((tx) => [
    tx.update(events).set(values).where(eq(events.id, id)),
    ...(participantIds === undefined
      ? []
      : replaceParticipantsWhere(tx, eq(events.id, id), participantIds)),
    // 基準日時や繰り返しが変わると回の照合キー（元の発生日時）が意味を失うため、未完了の回は捨てる。
    // 完了した回は履歴として残す
    ...(dropUncompletedOccurrences
      ? [tx.delete(events).where(and(eq(events.seriesId, id), isNull(events.completedAt)))]
      : []),
  ]);
}

/**
 * 繰り返しの回を実体化する。無ければ row で作り、あれば patch だけを当てる（同じ回への同時操作でも
 * 一意制約違反にならない）。参加者は、participantIds があれば置き換え、無ければ回が参加者を
 * 持たないときだけ繰り返し元から写す（作ったばかりの回。参加者は 1 人以上なので、0 人は写す前だけ）。
 *
 * 全文を 1 回の原子的な操作で行う。回の行と参加者を別の往復で書くと、行だけが残ったときに
 * 参加者 0 人の回になり、通知も配信も届かなくなる。回の ID は呼び出し側が知らないので、
 * 参加者の文は (series_id, occurrence_start) で回の行を引き当てる。
 */
export async function materializeOccurrence(
  row: Omit<NewEventRow, 'id'> & { seriesId: string; occurrenceStart: Date },
  patch: Partial<NewEventRow>,
  participantIds: string[] | undefined,
): Promise<void> {
  const isTarget = and(
    eq(events.seriesId, row.seriesId),
    eq(events.occurrenceStart, row.occurrenceStart),
  );
  await runBatch((tx) => [
    tx
      .insert(events)
      .values({ ...row, id: newId() })
      .onConflictDoUpdate({
        target: [events.seriesId, events.occurrenceStart],
        set: { ...patch, updatedAt: new Date() },
      }),
    ...(participantIds === undefined
      ? [copyMasterParticipants(tx, isTarget)]
      : replaceParticipantsWhere(tx, isTarget, participantIds)),
  ]);
}

/** 回が参加者を持たなければ、繰り返し元の参加者を写す */
function copyMasterParticipants(tx: Database, isTarget: SQL | undefined) {
  const master = alias(eventParticipants, 'master_participants');
  return tx.insert(eventParticipants).select(
    tx
      .select({ eventId: events.id, userId: master.userId })
      .from(events)
      .innerJoin(master, eq(master.eventId, events.seriesId))
      .where(and(isTarget, hasNoParticipants(tx))),
  );
}

/**
 * where に合う行（1 行）に userIds を参加者として入れる文。参加者の書き込みはすべてこの形にし、
 * 行と同じ runBatch に入れて行と参加者を原子的に書く。行は ID でも、ID を手元に持たない条件
 * （回の実体化の (series_id, occurrence_start)）でも引き当てられ、条件を足せば「作れたときだけ」入れられる。
 */
function insertParticipantsWhere(tx: Database, where: SQL | undefined, userIds: string[]) {
  return tx.insert(eventParticipants).select(
    tx
      .select({
        eventId: events.id,
        userId: unnestIds(userIds, 'user_id'),
      })
      .from(events)
      .where(where),
  );
}

/** events の行が参加者を 1 人も持たない。参加者は 1 人以上なので、これが真なのは参加者を入れる前だけ */
function hasNoParticipants(tx: Database): SQL {
  const own = alias(eventParticipants, 'own_participants');
  return notExists(tx.select({ one: sql`1` }).from(own).where(eq(own.eventId, events.id)));
}

/** where に合う行（1 行）の参加者を userIds に置き換える 2 文（消して入れ直す） */
function replaceParticipantsWhere(tx: Database, where: SQL | undefined, userIds: string[]) {
  const target = tx.select({ id: events.id }).from(events).where(where);
  return [
    tx.delete(eventParticipants).where(inArray(eventParticipants.eventId, target)),
    insertParticipantsWhere(tx, where, userIds),
  ] as const;
}

export async function remove(id: string): Promise<void> {
  await db.delete(events).where(eq(events.id, id));
}

/**
 * 「これ以降すべて」の分割: 元の繰り返しを UNTIL 付きに更新し、以降の回を消し、新しい繰り返し元を作る。
 * 全文を原子的に実行する（runBatch）。新しい行の id を返す
 */
export async function splitFollowing(input: {
  masterId: string;
  masterRRule: string;
  splitAt: Date;
  newRow: Omit<NewEventRow, 'id'>;
  participantIds: string[];
}): Promise<string> {
  const id = newId();
  await runBatch((tx) => [
    tx.update(events).set({ rrule: input.masterRRule }).where(eq(events.id, input.masterId)),
    tx
      .delete(events)
      .where(and(eq(events.seriesId, input.masterId), gte(events.occurrenceStart, input.splitAt))),
    tx.insert(events).values({ ...input.newRow, id }),
    insertParticipantsWhere(tx, eq(events.id, id), input.participantIds),
  ]);
  return id;
}

/** 「これ以降すべて」の削除: 元の繰り返しを UNTIL 付きに更新し、以降の回を消す */
export async function truncateFollowing(input: {
  masterId: string;
  masterRRule: string;
  splitAt: Date;
}): Promise<void> {
  await runBatch((tx) => [
    tx.update(events).set({ rrule: input.masterRRule }).where(eq(events.id, input.masterId)),
    tx
      .delete(events)
      .where(and(eq(events.seriesId, input.masterId), gte(events.occurrenceStart, input.splitAt))),
  ]);
}
