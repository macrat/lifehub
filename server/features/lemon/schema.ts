import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { CareType } from '../../../shared/validation/lemon.ts';
import { users } from '../users/schema.ts';

/**
 * レモンの木の世話記録。対象は 1 本に固定。
 * 植物を増やす場合は plants テーブルと plant_id を追加して拡張する。
 */
export const lemonCareLogs = pgTable('lemon_care_logs', {
  id: uuid('id').primaryKey(),
  careType: text('care_type').$type<CareType>().notNull(),
  doneAt: timestamp('done_at', { withTimezone: true }).notNull(),
  /** note 種別は必須、他は任意 */
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
});

export type LemonCareLogRow = typeof lemonCareLogs.$inferSelect;
