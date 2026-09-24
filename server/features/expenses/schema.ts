import { date, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { DateString } from '../../../shared/types.ts';
import { users } from '../users/schema.ts';

/**
 * 立替（借方・貸方）。from_user が to_user のために amount 円を払った。
 * to_user が null なら「共有」（2 人で折半）、ユーザーなら全額がそのユーザーの負担。
 * 精算（誰かが誰かに払った額）も同じ行で表す（from = 払った人、to = 受け取った人）。
 */
export const expenses = pgTable('expenses', {
  id: uuid('id').primaryKey(),
  fromUserId: uuid('from_user_id')
    .notNull()
    .references(() => users.id),
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
});

export type ExpenseRow = typeof expenses.$inferSelect;
