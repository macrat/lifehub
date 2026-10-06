import { sql } from 'drizzle-orm';
import { boolean, check, date, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { MONEY_RULE_KINDS, type MoneyRuleKind } from '../../../shared/money.ts';
import type { DateString } from '../../../shared/types.ts';
import { users } from '../users/schema.ts';

/**
 * Money Forward から取り込んだ口座の今の値（お金の画面のカード）。口座の名前ごとに 1 行で、取り込むたびに上書きする。
 * 人が作る記録ではなく外のサービスを写しただけなので、`created_by` などの共通の列は持たない（天気と同じ）。
 * どの口座をどの順に出すか・口座の種類は環境変数（`MONEYFORWARD_ACCOUNTS`）が決めるので、ここには値だけを置く。
 * 環境変数から外した口座の行は、次の取り込みで消す（`service.ts` の `syncMoneyForward`）。
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
 * Money Forward から取り込んだ入出金。取り込むたびに、取り込んだ期間の行を Money Forward の今の明細に合わせる
 * （新しい明細は足し、直された明細は上書きし、Money Forward で消された明細は消す。`repository.ts` の `saveImport`）。
 * `source_id` は Money Forward の明細の ID で、同じ明細を 2 度入れないための鍵。
 * 人が作る記録ではないので、`created_by` は持たない。
 *
 * 内容欄は Money Forward のまま（`original_description`）と、ルール（`money_rules`）で読み替えた後（`description`・
 * `direction`・`user_id`）の両方を持つ。ルールを変えたら、取り込み直さずに元の内容欄から読み替え直す（`service.ts` の `saveRules`）。
 * 画面・検索・精算は読み替えた後の列を読む（`hidden` も読み替えた後の値）。
 */
export const moneyTransactions = pgTable(
  'money_transactions',
  {
    id: uuid('id').primaryKey(),
    sourceId: text('source_id').notNull().unique(),
    /** 金融機関の名前（`money_accounts.name`。口座の行より先に明細が届くことがあるので外部キーにしない） */
    account: text('account').notNull(),
    occurredOn: date('occurred_on').$type<DateString>().notNull(),
    /** Money Forward の内容欄そのまま。ルールはこれに当てる */
    originalDescription: text('original_description').notNull(),
    /** ルールで読み替えた内容欄（置換しないルールや、どのルールにも当たらなければ元のまま） */
    description: text('description').notNull(),
    /** 円。入金は正、出金は負 */
    amount: integer('amount').notNull(),
    /**
     * ルールで「共有」との立替として算入するときの向き。deposit は対象者が共有口座へ入れた（対象者 → 共有）、
     * withdrawal は対象者が共有口座から引き出した（共有 → 対象者）。null はただの支出（精算に入れない）
     */
    direction: text('direction').$type<Exclude<MoneyRuleKind, 'spending'>>(),
    /** 立替の対象者。direction と組で、片方だけは持てない（`money_transactions_party_check`） */
    userId: uuid('user_id').references(() => users.id),
    /** ルールで一覧に出さないとした入出金（お金の画面の一覧・ホームのタイムラインに出さない。精算には入る） */
    hidden: boolean('hidden').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      'money_transactions_party_check',
      sql`(${table.direction} is null) = (${table.userId} is null) and (${table.direction} is null or ${table.direction} in ('deposit', 'withdrawal'))`,
    ),
  ],
);

export type MoneyTransactionRow = typeof moneyTransactions.$inferSelect;

/**
 * 入出金の読み替えのルール（管理画面の「入出金のルール」）。上から順に（`position` の小さい順）元の内容欄に当て、
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
