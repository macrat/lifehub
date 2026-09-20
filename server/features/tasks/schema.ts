import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from '../users/schema.ts';

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey(),
    title: text('title').notNull(),
    note: text('note'),
    /** null = 共有 */
    assigneeUserId: uuid('assignee_user_id').references(() => users.id, { onDelete: 'set null' }),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    dueAt: timestamp('due_at', { withTimezone: true }),
    /** RFC 5545 RRULE（DTSTART なし）。DTSTART は starts_at（無ければ due_at）。null = 単発 */
    rrule: text('rrule'),
    notifyAtStart: boolean('notify_at_start').notNull().default(false),
    notifyAtDue: boolean('notify_at_due').notNull().default(false),
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
    index('tasks_starts_at_idx').on(table.startsAt),
    index('tasks_due_at_idx').on(table.dueAt),
  ],
);

/** 繰り返しタスクの特定の回だけの変更・取り消し */
export const taskOverrides = pgTable(
  'task_overrides',
  {
    id: uuid('id').primaryKey(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    /** 発生の基準日時の ISO 8601（UTC） */
    occurrenceKey: text('occurrence_key').notNull(),
    cancelled: boolean('cancelled').notNull().default(false),
    title: text('title'),
    note: text('note'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    dueAt: timestamp('due_at', { withTimezone: true }),
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
    uniqueIndex('task_overrides_task_occurrence_uq').on(table.taskId, table.occurrenceKey),
  ],
);

/** 完了の記録。単発は occurrence_key = 'single' */
export const taskCompletions = pgTable(
  'task_completions',
  {
    id: uuid('id').primaryKey(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    occurrenceKey: text('occurrence_key').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull(),
    completedBy: uuid('completed_by')
      .notNull()
      .references(() => users.id),
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
    uniqueIndex('task_completions_task_occurrence_uq').on(table.taskId, table.occurrenceKey),
    index('task_completions_completed_at_idx').on(table.completedAt),
  ],
);

export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;
export type TaskOverrideRow = typeof taskOverrides.$inferSelect;
export type NewTaskOverrideRow = typeof taskOverrides.$inferInsert;
export type TaskCompletionRow = typeof taskCompletions.$inferSelect;
