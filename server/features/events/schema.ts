import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  ALL_DAY_REMIND_OPTIONS,
  type EventKind,
  type RemindMinutes,
} from '../../../shared/validation/events.ts';
import { users } from '../users/schema.ts';

/**
 * 予定とタスクを 1 つにしたイベント。kind で振る舞い（完了の有無、表示位置の規則）だけが変わる。
 *
 * 繰り返しは RRULE を持つ行（繰り返し元）を展開して表し、回ごとの行は作らない。
 * 「この回だけ」の変更・取り消し・完了は、その回を全項目の複製として実体化した行（series_id と
 * occurrence_start を持つ）で表す。実効値は行そのもので、繰り返し元との合成はしない。
 * 繰り返し元を消すと派生行は CASCADE で消える。
 */
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey(),
    kind: text('kind').$type<EventKind>().notNull(),
    title: text('title').notNull(),
    /** 終日は starts_at = JST 0:00、ends_at = 翌日 JST 0:00 */
    allDay: boolean('all_day').notNull().default(false),
    /** 予定・タスクの開始。繰り返しの基準日時（DTSTART）でもある */
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    /** 予定の終了（終端は排他的）。タスクは持たない */
    endsAt: timestamp('ends_at', { withTimezone: true }),
    /** タスクのみ。null = 未完了 */
    completedAt: timestamp('completed_at', { withTimezone: true }),
    location: text('location'),
    note: text('note'),
    /** 開始の n 分前に通知。終日は 0 = 当日、1440 = 前日（各自の通知時刻）。null = 通知なし */
    remindStartMinutes: integer('remind_start_minutes').$type<RemindMinutes>(),
    /** 予定の終了の n 分前に通知。null = 通知なし（タスクは常に null） */
    remindEndMinutes: integer('remind_end_minutes').$type<RemindMinutes>(),
    /** RFC 5545 RRULE（DTSTART なし）。DTSTART は starts_at。null = 単発 */
    rrule: text('rrule'),
    /** 繰り返しの一部として作られた行が指す繰り返し元 */
    seriesId: uuid('series_id').references((): AnyPgColumn => events.id, { onDelete: 'cascade' }),
    /** この行が置き換える元の発生の基準日時 */
    occurrenceStart: timestamp('occurrence_start', { withTimezone: true }),
    /** その回の取り消し */
    cancelled: boolean('cancelled').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    // series_id だけの検索（回の取得・削除）も、この複合一意索引の先頭列で足りる
    uniqueIndex('events_series_occurrence_uq').on(table.seriesId, table.occurrenceStart),
    check('events_kind_check', sql`${table.kind} in ('event', 'task')`),
    // 終わりを持つのは予定だけ（予定は必須、タスクは持たない）
    check(
      'events_end_only_event_check',
      sql`(${table.kind} = 'event') = (${table.endsAt} is not null)`,
    ),
    check(
      'events_remind_end_only_event_check',
      sql`${table.kind} = 'event' or ${table.remindEndMinutes} is null`,
    ),
    check(
      'events_task_only_completed_check',
      sql`${table.kind} = 'task' or ${table.completedAt} is null`,
    ),
    check(
      'events_series_pair_check',
      sql`(${table.seriesId} is null) = (${table.occurrenceStart} is null)`,
    ),
    check(
      'events_series_not_recurring_check',
      sql`${table.seriesId} is null or ${table.rrule} is null`,
    ),
    // 終日の通知は日単位だけ。値は ALL_DAY_REMIND_OPTIONS から組む（選択肢を変えたらここも必ず変わる）。
    // sql.raw なのは、束縛変数にすると制約の定義そのものに $1 が並んでしまうため
    check(
      'events_all_day_remind_check',
      sql`not ${table.allDay} or (coalesce(${table.remindStartMinutes}, 0) in ${sql.raw(`(${ALL_DAY_REMIND_OPTIONS.join(', ')})`)} and coalesce(${table.remindEndMinutes}, 0) in ${sql.raw(`(${ALL_DAY_REMIND_OPTIONS.join(', ')})`)})`,
    ),
    check(
      'events_cancelled_only_series_check',
      sql`not ${table.cancelled} or ${table.seriesId} is not null`,
    ),
  ],
);

/** 参加者。1 行以上あることはアプリ側（Zod）で守る */
export const eventParticipants = pgTable(
  'event_participants',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.userId] })],
);

export type EventRow = typeof events.$inferSelect;
export type NewEventRow = typeof events.$inferInsert;
