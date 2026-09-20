import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../features/users/schema.ts';

/** Web Push の購読。端末ごとに 1 行で、user_id がその端末の持ち主（作成者を別に持たない）。配信失敗（410/404）で削除する */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('push_subscriptions_user_id_idx').on(table.userId)],
);

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
