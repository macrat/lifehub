import { sql } from 'drizzle-orm';
import { check, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { CARE_TYPES, type CareType } from '../../../shared/validation/lemon.ts';
import { users } from '../users/schema.ts';

/**
 * レモンの木の世話記録。1 回の記録に項目をいくつでも結び付ける（care_types）。対象は 1 本に固定。
 * 植物を増やす場合は plants テーブルと plant_id を追加して拡張する。
 */
export const lemonCareLogs = pgTable(
  'lemon_care_logs',
  {
    id: uuid('id').primaryKey(),
    /** その 1 回でやったこと。空なら項目に結び付かない記録（メモ） */
    careTypes: text('care_types').array().$type<CareType[]>().notNull(),
    doneAt: timestamp('done_at', { withTimezone: true }).notNull(),
    /** care_types が空なら必須、そうでなければ任意 */
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    /**
     * 記録した人。API キー（記録投入用エンドポイント）で入れた記録は null（不明）。
     * WHY: キーを持つボタンは家の誰が押しても同じキーで送るので、キーの持ち主を記録者にすると誤りになる
     */
    createdBy: uuid('created_by').references(() => users.id),
    /**
     * API キーで入れた記録の、そのキーの名前（記録した時点のもの）。画面から・MCP から入れた記録は null。
     * 記録した人が分からない記録を、どこから入ったか（「玄関のボタン」など）で見分けるために出す。
     * WHY NOT api_keys への参照: キーを失効すると行ごと消え、過去の記録がどこから入ったかまで失われる
     */
    apiKeyName: text('api_key_name'),
  },
  (table) => [
    // 項目の綴りは CARE_TYPES から組む（値を足したらここも必ず変わる）。
    // sql.raw なのは、束縛変数にすると制約の定義そのものに $1 が並んでしまうため
    check(
      'lemon_care_logs_care_types_check',
      sql`${table.careTypes} <@ ${sql.raw(`array[${CARE_TYPES.map((t) => `'${t}'`).join(', ')}]::text[]`)}`,
    ),
    // やったことが 1 つも無い記録はメモそのもの。本文まで空だと何も残らない
    check(
      'lemon_care_logs_memo_has_note_check',
      sql`cardinality(${table.careTypes}) > 0 or (${table.note} is not null and ${table.note} <> '')`,
    ),
    // どこから入ったかは、記録した人か API キーの名前のちょうど一方（`CareLogSource`）
    check(
      'lemon_care_logs_source_check',
      sql`num_nonnulls(${table.createdBy}, ${table.apiKeyName}) = 1`,
    ),
  ],
);

export type LemonCareLogRow = typeof lemonCareLogs.$inferSelect;
