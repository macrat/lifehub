import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../users/schema.ts';

/**
 * メモ。ホームのタイムラインに書き留める一言（プレーンテキスト、500 文字まで）。
 * 日時は書いた時刻（created_at）だけで、編集しても動かない。
 */
export const memos = pgTable('memos', {
  id: uuid('id').primaryKey(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  /** 書いた人。タイムラインではこの人の色と名前で出す */
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  /** MCP で書いたメモの、書いた MCP クライアントの名前（書いた時点の名前を残す）。画面で書いたメモは null */
  mcpClientName: text('mcp_client_name'),
});

export type MemoRow = typeof memos.$inferSelect;
