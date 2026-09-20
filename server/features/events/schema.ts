import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../users/schema.ts';

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey(),
    title: text('title').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    /** 終端は排他的。終日は starts_at = JST 0:00、ends_at = 翌日 JST 0:00 */
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    allDay: boolean('all_day').notNull().default(false),
    /** null = 共有 */
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    location: text('location'),
    note: text('note'),
    /** RFC 5545 RRULE（DTSTART なし）。null = 単発 */
    rrule: text('rrule'),
    /** null = 通知なし */
    remindBeforeMinutes: integer('remind_before_minutes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [index('events_starts_at_idx').on(table.startsAt)],
);

/** 繰り返し予定の個別変更・削除（RFC 5545 の RECURRENCE-ID 相当） */
export const eventOverrides = pgTable(
  'event_overrides',
  {
    id: uuid('id').primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    /** 元の発生の開始日時 */
    occurrenceStart: timestamp('occurrence_start', { withTimezone: true }).notNull(),
    cancelled: boolean('cancelled').notNull().default(false),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    title: text('title'),
    note: text('note'),
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
    uniqueIndex('event_overrides_event_occurrence_uq').on(table.eventId, table.occurrenceStart),
  ],
);

export type EventRow = typeof events.$inferSelect;
export type NewEventRow = typeof events.$inferInsert;
export type EventOverrideRow = typeof eventOverrides.$inferSelect;
export type NewEventOverrideRow = typeof eventOverrides.$inferInsert;
