import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../users/schema.ts';

/**
 * カレンダーを ics で配る URL。1 ユーザーが何本でも持て、行を消せばその URL だけが即座に失効する。
 *
 * `user_id` は作成者ではなく持ち主なので `created_by` を別に持たない（`push_subscriptions` と同じ）。
 *
 * トークンはハッシュ化せずそのまま置く。DB を読める者はカレンダーの中身もそのまま読めるので
 * ハッシュ化しても守れるものは増えない一方、発行した瞬間にしか URL を出せなくなり、
 * 別の端末に登録し直すたびに発行し直すことになるため。
 *
 * 索引は `token` の一意制約だけにする。配信のたびに引くのはトークンで、一覧は数本しかない行の
 * 全走査で足りる（`docs/data-model.md` の共通規約）。
 */
export const calendarFeeds = pgTable('calendar_feeds', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** 渡した先を見分けるための名前 */
  name: text('name').notNull(),
  /** URL に載る秘密。これを知っていることだけが配信を受け取る資格になる */
  token: text('token').notNull().unique(),
  /** 最後に配信した日時。まだ使われていない URL と、使われなくなった URL を見分ける。null = 未配信 */
  lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
