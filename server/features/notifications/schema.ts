import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** 送信済み通知の台帳（QStash の再送時の重複防止）。古い行は日次 Cron で削除する */
export const sentNotifications = pgTable('sent_notifications', {
  key: text('key').primaryKey(),
  sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
});
