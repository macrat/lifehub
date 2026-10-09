import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../users/schema.ts';

/**
 * MCP Events の購読（webhook 配信）。購読 1 件に 1 行で、user_id が購読した人（作成者を別に持たない）、
 * client_id が購読した MCP クライアント（OAuth のクライアント ID。そのクライアントの失効で一緒に消す）。
 * id は購読の素性（人・クライアント・通知先 URL・イベント名）から導く（`subscriptionIdOf`）ので、同じ購読をし直すと同じ行を更新する。
 * 期限（expires_at）を過ぎた行は配信せず、次の購読のときに消す。
 */
export const mcpEventSubscriptions = pgTable(
  'mcp_event_subscriptions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * WHY NOT oauth_clients への外部キー: 消すのは失効（mcp-clients）が明示的に行う。
     * oauth_clients は better-auth が管理する行で、購読の側から消え方を縛らない。
     */
    clientId: text('client_id').notNull(),
    name: text('name').notNull(),
    url: text('url').notNull(),
    /** 署名の鍵（`whsec_` 付きの base64）。購読し直しで変わったら、前の鍵も一定の間だけ併せて署名する */
    secret: text('secret').notNull(),
    previousSecret: text('previous_secret'),
    previousSecretExpiresAt: timestamp('previous_secret_expires_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('mcp_event_subscriptions_name_idx').on(table.name)],
);

export type McpEventSubscriptionRow = typeof mcpEventSubscriptions.$inferSelect;
export type NewMcpEventSubscriptionRow = typeof mcpEventSubscriptions.$inferInsert;
