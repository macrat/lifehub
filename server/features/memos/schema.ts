import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../users/schema.ts';

/**
 * メモ。ホームのタイムラインに書き留める一言（プレーンテキスト、500 文字まで）。
 * 日時は書いた時刻（created_at）だけで、編集しても動かない。
 */
export const memos = pgTable('memos', {
  id: uuid('id').primaryKey(),
  body: text('body').notNull(),
  /** ピン止め。ホームのタイムラインの一番上に固定して出す（ピン止めしても書いた時刻は変わらない） */
  pinned: boolean('pinned').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  /** 書いた人。タイムラインではこの人の色と名前で出す */
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
});

export type MemoRow = typeof memos.$inferSelect;
