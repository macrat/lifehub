import { date, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../users/schema.ts';

/** 立替。常に折半 */
export const expenses = pgTable(
  'expenses',
  {
    id: uuid('id').primaryKey(),
    paidBy: uuid('paid_by')
      .notNull()
      .references(() => users.id),
    /** 円 */
    amount: integer('amount').notNull(),
    description: text('description').notNull(),
    spentOn: date('spent_on').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [index('expenses_spent_on_idx').on(table.spentOn)],
);

/** 精算。from_user が to_user に amount 円を渡した */
export const settlements = pgTable('settlements', {
  id: uuid('id').primaryKey(),
  fromUser: uuid('from_user')
    .notNull()
    .references(() => users.id),
  toUser: uuid('to_user')
    .notNull()
    .references(() => users.id),
  amount: integer('amount').notNull(),
  settledOn: date('settled_on').notNull(),
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
export type SettlementRow = typeof settlements.$inferSelect;
