import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { SecretHash } from '../../lib/secret.ts';
import { users } from '../users/schema.ts';

/**
 * 記録投入用エンドポイント（`POST /api/records`）を呼ぶための API キー。
 * 1 ユーザーが何本でも持て、行を消せばそのキーだけが即座に失効する。キーで投入した記録は記録した人を不明にし、キーの名前を残す（`lemon_care_logs.api_key_name`）。
 *
 * `user_id` は作成者ではなく持ち主なので `created_by` を別に持たない（`calendar_feeds` と同じ）。
 *
 * キーはそのまま置かず、SHA-256 のハッシュだけを置く。DB を読めても書き込みの資格までは渡さないため
 * （配信 URL のトークンは読むための資格で、DB を読める者は中身もそのまま読めるので平文で置いているが、
 * こちらは書くための資格なので事情が違う）。キーは発行した瞬間にしか見られない。
 * 遅いハッシュ（bcrypt など）にしないのは、256 ビットの乱数は総当たりできず、遅くする意味が無いため。
 *
 * 索引は `key_hash` の一意制約だけにする（受け付けのたびに引くのはハッシュで、一覧は数本の全走査で足りる）。
 */
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** 渡した先を見分けるための名前 */
  name: text('name').notNull(),
  /** キーの SHA-256（base64url） */
  keyHash: text('key_hash').$type<SecretHash>().notNull().unique(),
  /** 最後に使われた日時。まだ使われていないキーと、使われなくなったキーを見分ける。null = 未使用 */
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export type ApiKeyRow = typeof apiKeys.$inferSelect;
