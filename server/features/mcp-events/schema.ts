import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { oauthConsents } from '../../lib/db/oauth-schema.ts';
import { users } from '../users/schema.ts';

/**
 * MCP Events の購読（webhook 配信）。購読 1 件に 1 行で、user_id が購読した人（作成者を別に持たない）、
 * consent_id が購読を求めた MCP クライアントへの許可（OAuth の同意）。許可が消えれば購読も消える。
 * id は購読の素性（許可・通知先 URL・イベント名）から導く（`subscriptionIdOf`）ので、同じ購読をし直すと同じ行を更新する。
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
     * WHY 同意への外部キー: クライアントの失効（mcp-clients）でも、ほかの経路で同意が消えたときでも、
     * そのクライアントの購読が残って webhook を送り続けないようにする。同意の行は許可し直しても
     * 作り直されず更新されるので、id は許可が続く間変わらない。
     */
    consentId: uuid('consent_id')
      .notNull()
      .references(() => oauthConsents.id, { onDelete: 'cascade' }),
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
