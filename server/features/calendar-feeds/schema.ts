import { pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../users/schema.ts';

/**
 * カレンダーを ics で配る URL。1 ユーザーが何本でも持て、行を消せばその URL だけが即座に失効する。
 *
 * `user_id` は作成者ではなく持ち主なので `created_by` を別に持たない（`push_subscriptions` と同じ）。
 *
 * トークンそのものは置かず、ハッシュだけを置く（`server/lib/secret.ts` の `hashSecret`）。
 * DB のダンプが漏れても、そこから配信 URL を組み立てられないようにするため。
 *
 * 索引は `token_hash` の一意制約だけにする。配信のたびに引くのはトークンのハッシュで、一覧は数本しかない行の
 * 全走査で足りる（`docs/data-model.md` の共通規約）。
 */
export const calendarFeeds = pgTable('calendar_feeds', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** 渡した先を見分けるための名前 */
  name: text('name').notNull(),
  /** URL に載る秘密（トークン）のハッシュ。トークンを知っていることだけが配信を受け取る資格になる */
  tokenHash: text('token_hash').notNull().unique(),
  /** 最後に配信した日時。まだ使われていない URL と、使われなくなった URL を見分ける。null = 未配信 */
  lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export type CalendarFeedRow = typeof calendarFeeds.$inferSelect;

/**
 * 配信 URL に載せる参加者。この中の誰かが入っている予定だけを配る。
 *
 * 1 行以上あることはアプリ側（Zod）で守る（`event_participants` と同じく、結合テーブルでは
 * DB 制約にできない）。0 人の URL は何も配らず、持っていても意味が無い。
 *
 * 誰を載せるかを列（配列）ではなく行で持つのは、消えたユーザーの ID が残らないようにするため
 * （`users` を参照して ON DELETE CASCADE で一緒に消える）。
 */
export const calendarFeedParticipants = pgTable(
  'calendar_feed_participants',
  {
    feedId: uuid('feed_id')
      .notNull()
      .references(() => calendarFeeds.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.feedId, table.userId] })],
);
