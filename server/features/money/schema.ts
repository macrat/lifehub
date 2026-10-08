import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  MONEY_RULE_KINDS,
  type MoneyRuleKind,
  SCHEDULE_FREQUENCIES,
  type ScheduleFrequency,
} from '../../../shared/money.ts';
import type { DateString } from '../../../shared/types.ts';
import { users } from '../users/schema.ts';

/**
 * お金の記録（お金の画面の一覧・精算・タイムラインの元）。手で入れた立替と、Money Forward から取り込んだ入出金を同じ表に置く
 * （形は shared/money.ts の `MoneyRecord`）。どちらも「誰が誰のために払ったか」を from・to で持ち、精算はこの表だけから出す。
 * - 手で入れた立替（account が null）: from が to のために amount 円（正）を払い、from に債権、to に債務が生じた。
 *   from・to の null は「共有」（共有口座）で、どちらかは必ず持つ。精算（誰かが誰かに払った額）も同じ行で表す。
 * - 取り込んだ入出金（account が金融機関の名前）: amount は入金が正・出金が負。取り込みルール（`money_rules`）で
 *   「共有」との立替にしたものは from・to を持ち（入金は 対象者 → 共有、出金は 共有 → 対象者）、ただの支出は from・to とも null。
 *   内容欄は Money Forward のまま（`original_description`）と読み替えた後（`description`）の両方を持ち、ルールを変えたら
 *   取り込み直さずに読み替え直す（`sync.ts` の `saveRules`）。`source_id` は Money Forward の明細の ID で、同じ明細を
 *   2 度入れないための鍵。人が作る記録ではないので `created_by` は持たない。画面からは直さない
 * WHY 1 つの表: 画面では立替と入出金を 1 本の一覧に並べ、同じ絞り込みと精算に入れる。表を分けると、一覧のページ分け・
 * 絞り込み・精算の合計・タイムラインのどれにも 2 つの表をつなぐ読み替えが要る。
 */
export const moneyRecords = pgTable(
  'money_records',
  {
    id: uuid('id').primaryKey(),
    fromUserId: uuid('from_user_id').references(() => users.id),
    toUserId: uuid('to_user_id').references(() => users.id),
    /** 円。手で入れた立替は正、取り込んだ入出金は入金が正・出金が負 */
    amount: integer('amount').notNull(),
    description: text('description').notNull(),
    /** 使った日・明細の日付 */
    occurredOn: date('occurred_on').$type<DateString>().notNull(),
    /** 取り込んだ金融機関の名前（`money_accounts.name`。口座の行より先に明細が届くことがあるので外部キーにしない）。null は手で入れた立替 */
    account: text('account'),
    /** Money Forward の明細の ID（取り込んだ入出金だけ） */
    sourceId: text('source_id').unique(),
    /** Money Forward の内容欄そのまま（取り込んだ入出金だけ）。ルールはこれに当てる */
    originalDescription: text('original_description'),
    /** ルールで一覧（お金の画面・ホームのタイムライン）に出さないとした入出金。精算には入る */
    hidden: boolean('hidden').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    /** 記録した人（手で入れた立替だけ） */
    createdBy: uuid('created_by').references(() => users.id),
  },
  (table) => [
    // 手で入れた立替は当事者のどちらかと記録した人を持つ（共有から共有へは貸し借りが生じない。同じユーザー同士は `expenseSchema` が止める）
    check(
      'money_records_manual_check',
      sql`${table.account} is not null or (num_nonnulls(${table.fromUserId}, ${table.toUserId}) > 0 and ${table.createdBy} is not null)`,
    ),
    // 取り込んだ入出金だけが明細の ID と元の内容欄を持つ
    check(
      'money_records_import_check',
      sql`(${table.account} is null) = (${table.sourceId} is null) and (${table.account} is null) = (${table.originalDescription} is null)`,
    ),
  ],
);

export type MoneyRecordRow = typeof moneyRecords.$inferSelect;

/**
 * 立替スケジュール（設定の「立替スケジュール」）。日が来たら、この内容の立替を 1 件ずつ `money_records` に記録する
 * （記録した立替は手で入れた立替と同じ行で、スケジュールとのつながりは持たない）。
 * starts_on は最初の日、frequency は繰り返し（回の日の決め方は shared/money.ts の `scheduleDate`）。
 * generated_through は記録し終えた日（この日までの回は記録した）。最初は starts_on の前日で、記録するたびに進める。
 * 記録した立替を消しても記録し直さないよう、回ではなく日付で覚える。
 * WHY 回を普通の立替として記録する（読むときに展開しない）: 一覧のページ分け・精算の合計・絞り込み・タイムライン・
 * MCP・オフラインの書き込みが、どれも今の立替の仕組みのまま回を扱える。
 */
export const moneySchedules = pgTable(
  'money_schedules',
  {
    id: uuid('id').primaryKey(),
    fromUserId: uuid('from_user_id').references(() => users.id),
    toUserId: uuid('to_user_id').references(() => users.id),
    amount: integer('amount').notNull(),
    description: text('description').notNull(),
    startsOn: date('starts_on').$type<DateString>().notNull(),
    frequency: text('frequency').$type<ScheduleFrequency>().notNull(),
    generatedThrough: date('generated_through').$type<DateString>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    check(
      'money_schedules_parties_check',
      sql`num_nonnulls(${table.fromUserId}, ${table.toUserId}) > 0`,
    ),
    check(
      'money_schedules_frequency_check',
      sql`${table.frequency} in (${sql.raw(SCHEDULE_FREQUENCIES.map((f) => `'${f}'`).join(', '))})`,
    ),
  ],
);

export type MoneyScheduleRow = typeof moneySchedules.$inferSelect;

/**
 * Money Forward から取り込んだ口座の今の値（お金の画面のカード）。口座の名前ごとに 1 行で、取り込むたびに上書きする。
 * 人が作る記録ではなく外のサービスを写しただけなので、`created_by` などの共通の列は持たない（天気と同じ）。
 * どの口座をどの順に出すか・口座の種類は環境変数（`MONEYFORWARD_ACCOUNTS`）が決めるので、ここには値だけを置く。
 * 環境変数から外した口座の行は、次の取り込みで消す（`sync.ts` の `syncMoneyForward`）。
 */
export const moneyAccounts = pgTable('money_accounts', {
  /** Money Forward での金融機関の名前 */
  name: text('name').primaryKey(),
  /** 銀行の残高・証券の評価額（円）。読めなかったら null */
  balance: integer('balance'),
  /** クレジットカードの次回の引き落とし額（円）と日。読めなかったら null */
  withdrawalAmount: integer('withdrawal_amount'),
  withdrawalOn: date('withdrawal_on').$type<DateString>(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull(),
});

export type MoneyAccountRow = typeof moneyAccounts.$inferSelect;

/**
 * 口座の値の日ごとの記録（残高の推移のグラフ）。取り込むたびに、その日（JST）の行を口座の今の値で上書きする
 * （同じ日に何度取り込んでも 1 日 1 行で、最後に読んだ値が残る）。
 * WHY 自分で記録する: Money Forward の資産推移は分類（預金・株式など）ごとの合計だけで、口座ごとの推移を読める画面が無い。
 * そのため推移は記録を始めた日からしか無い。
 * balance はグラフに出す向き（`MoneyBalance`）: 銀行は残高、証券は評価額、カードは負債額を負の数で持つ（取り込みで向きを揃える）。
 * 環境変数から外した口座の行は、次の取り込みで消す（口座の行と同じ）。
 */
export const moneyBalances = pgTable(
  'money_balances',
  {
    account: text('account').notNull(),
    recordedOn: date('recorded_on').$type<DateString>().notNull(),
    balance: integer('balance').notNull(),
  },
  (table) => [primaryKey({ columns: [table.account, table.recordedOn] })],
);

export type MoneyBalanceRow = typeof moneyBalances.$inferSelect;

/**
 * 入出金の読み替えのルール（設定から開く「取り込みルール」）。上から順に（`position` の小さい順）元の内容欄に当て、
 * 最初に当たった 1 つだけを使う。家族で 1 つの並びなので、ユーザーごとには持たない。
 * 保存は並び全体の置き換え（`repository.ts` の `replaceRules`）。
 */
export const moneyRules = pgTable(
  'money_rules',
  {
    id: uuid('id').primaryKey(),
    position: integer('position').notNull(),
    /** 元の内容欄に当てる正規表現（JavaScript の RegExp） */
    pattern: text('pattern').notNull(),
    /** 内容欄を置き換えるか */
    replaceDescription: boolean('replace_description').notNull(),
    /** 置き換えた後の内容欄。$1 や $<名前> でキャプチャを差し込める。置き換えないときは使わない */
    replacement: text('replacement').notNull(),
    /** spending（ただの支出）・deposit（入金）・withdrawal（出金） */
    kind: text('kind').$type<MoneyRuleKind>().notNull(),
    /** 入金・出金の対象者。支出なら null */
    userId: uuid('user_id').references(() => users.id),
    /** 当たった入出金を一覧に出さないか */
    hidden: boolean('hidden').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    check(
      'money_rules_kind_check',
      sql`${table.kind} in (${sql.raw(MONEY_RULE_KINDS.map((k) => `'${k}'`).join(', '))}) and (${table.kind} = 'spending') = (${table.userId} is null)`,
    ),
  ],
);

export type MoneyRuleRow = typeof moneyRules.$inferSelect;
