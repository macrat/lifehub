import {
  and,
  eq,
  getTableColumns,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import { alias, type PgColumn } from 'drizzle-orm/pg-core';
import { newId } from '../../../shared/id.ts';
import { db, idArrayAgg, runBatch } from '../../lib/db.ts';
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

/**
 * [from, to) に発生を持ちうる繰り返し元・単発の行を選ぶ条件。
 * ここでの絞り込みは「読む量を減らすための粗いふるい」で、範囲との厳密な重なりは展開後に判定する。
 */
type CandidateColumns = Record<
  'seriesId' | 'rrule' | 'kind' | 'startsAt' | 'endsAt' | 'completedAt',
  PgColumn
>;

function isCandidate(table: CandidateColumns, from: Date, to: Date): SQL | undefined {
  const base = sql`coalesce(${table.startsAt}, ${table.endsAt})`;
  return and(
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

export async function findById(id: string): Promise<EventWithParticipants | undefined> {
  const rows = await selectRows().where(eq(events.id, id)).groupBy(events.id).limit(1);
  return rows[0];
}

/**
 * カレンダーの組み立てに要る行をまとめて読む: [from, to) に発生を持ちうる繰り返し元・単発と、
 * それらに属する実体化された回。1 回の問い合わせで済ませる（Neon の HTTP ドライバでは
 * 問い合わせ 1 回が往復 1 回なので、回数がそのまま応答時間になる）。
 */
export async function findCalendarRows(from: Date, to: Date): Promise<EventWithParticipants[]> {
  const master = alias(events, 'master');
  return selectRows()
    .where(
      or(
        isCandidate(events, from, to),
        inArray(
          events.seriesId,
          db
            .select({ id: master.id })
            .from(master)
            .where(isCandidate(master, from, to)),
        ),
      ),
    )
    .groupBy(events.id)
    .orderBy(events.startsAt, events.createdAt);
}

function participantRows(eventId: string, userIds: string[]) {
  return userIds.map((userId) => ({ eventId, userId }));
}

/**
 * 行と参加者を原子的に作る。id は呼び出し元（多くはクライアント）が決めたもの。
 * 同じ id で送り直されたら（オフラインで溜めた書き込みの再送）同じ値を書き直すだけにして、二重に作らない。
 */
export async function insert(row: NewEventRow, participantIds: string[]): Promise<void> {
  await runBatch((tx) => [
    tx.insert(events).values(row).onConflictDoUpdate({ target: events.id, set: row }),
    tx
      .insert(eventParticipants)
      .values(participantRows(row.id, participantIds))
      .onConflictDoNothing(),
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
      : [
          tx.delete(eventParticipants).where(eq(eventParticipants.eventId, id)),
          tx.insert(eventParticipants).values(participantRows(id, participantIds)),
        ]),
    // 基準日時や繰り返しが変わると回の照合キー（元の発生日時）が意味を失うため、未完了の回は捨てる。
    // 完了した回は履歴として残す
    ...(dropUncompletedOccurrences
      ? [tx.delete(events).where(and(eq(events.seriesId, id), isNull(events.completedAt)))]
      : []),
  ]);
}

/**
 * 繰り返しの回を実体化する。無ければ row で作り、あれば patch だけを当てる（同じ回への同時操作でも
 * 一意制約違反にならない）。inserted は新しく作ったかどうか（Postgres の xmax = 0 の慣用句）
 */
export async function upsertOccurrence(
  row: Omit<NewEventRow, 'id'>,
  patch: Partial<NewEventRow>,
): Promise<{ id: string; inserted: boolean }> {
  const rows = await db
    .insert(events)
    .values({ ...row, id: newId() })
    .onConflictDoUpdate({
      target: [events.seriesId, events.occurrenceStart],
      set: { ...patch, updatedAt: new Date() },
    })
    .returning({ id: events.id, inserted: sql<boolean>`(xmax = 0)` });
  const result = rows[0];
  if (!result) throw new Error('upsert returned no row');
  return result;
}

export async function setParticipants(eventId: string, userIds: string[]): Promise<void> {
  await runBatch((tx) => [
    tx.delete(eventParticipants).where(eq(eventParticipants.eventId, eventId)),
    tx.insert(eventParticipants).values(participantRows(eventId, userIds)),
  ]);
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
    tx.insert(eventParticipants).values(participantRows(id, input.participantIds)),
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
