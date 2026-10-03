import { sql } from 'drizzle-orm';
import { check, date, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
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
