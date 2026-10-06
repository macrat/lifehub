import { sql } from 'drizzle-orm';
import { check, date, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { SCHEDULE_FREQUENCIES, type ScheduleFrequency } from '../../../shared/expenses.ts';
import type { DateString } from '../../../shared/types.ts';
import { users } from '../users/schema.ts';

/**
 * 立替（ユーザーと共有口座の間の資金の貸し借り）。from が to のために amount 円を払い、from に債権、to に債務が生じた。
 * from・to の null は「共有」（共有口座）。to が null なら共有のための支払い、from が null なら共有からの引き出し。
 * 精算（誰かが誰かに払った額）も同じ行で表す（from = 払った人、to = 受け取った人）。
 */
export const expenses = pgTable(
  'expenses',
  {
    id: uuid('id').primaryKey(),
    fromUserId: uuid('from_user_id').references(() => users.id),
    toUserId: uuid('to_user_id').references(() => users.id),
    /** 円 */
    amount: integer('amount').notNull(),
    description: text('description').notNull(),
    spentOn: date('spent_on').$type<DateString>().notNull(),
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
    // 共有から共有へは貸し借りが生じない（同じユーザー同士は `expenseSchema` が止める）
    check('expenses_parties_check', sql`num_nonnulls(${table.fromUserId}, ${table.toUserId}) > 0`),
  ],
);

export type ExpenseRow = typeof expenses.$inferSelect;

/**
 * 立替スケジュール（設定の「立替スケジュール」）。日が来たら、この内容の立替を 1 件ずつ `expenses` に記録する
 * （記録した立替は手で入れた立替と同じ行で、スケジュールとのつながりは持たない）。
 * starts_on は最初の日、frequency は繰り返し（回の日の決め方は shared/expenses.ts の `scheduleDate`）。
 * generated_through は記録し終えた日（この日までの回は記録した）。最初は starts_on の前日で、記録するたびに進める。
 * 記録した立替を消しても記録し直さないよう、回ではなく日付で覚える。
 * WHY 回を普通の立替として記録する（読むときに展開しない）: 一覧のページ分け・精算の合計・絞り込み・タイムライン・
 * MCP・オフラインの書き込みが、どれも今の立替の仕組みのまま回を扱える。
 */
export const expenseSchedules = pgTable(
  'expense_schedules',
  {
    id: uuid('id').primaryKey(),
    fromUserId: uuid('from_user_id').references(() => users.id),
    toUserId: uuid('to_user_id').references(() => users.id),
    amount: integer('amount').notNull(),
    description: text('description').notNull(),
    startsOn: date('starts_on').$type<DateString>().notNull(),
    frequency: text('frequency').$type<ScheduleFrequency>().notNull(),
    generatedThrough: date('generated_through').$type<DateString>().notNull(),
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
    check(
      'expense_schedules_parties_check',
      sql`num_nonnulls(${table.fromUserId}, ${table.toUserId}) > 0`,
    ),
    check(
      'expense_schedules_frequency_check',
      sql`${table.frequency} in (${sql.raw(SCHEDULE_FREQUENCIES.map((f) => `'${f}'`).join(', '))})`,
    ),
  ],
);

export type ExpenseScheduleRow = typeof expenseSchedules.$inferSelect;
