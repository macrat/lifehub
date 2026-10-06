import { date, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { DateString } from '../../../shared/types.ts';

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
 */
export const moneyTransactions = pgTable('money_transactions', {
  id: uuid('id').primaryKey(),
  sourceId: text('source_id').notNull().unique(),
  /** 金融機関の名前（`money_accounts.name`。口座の行より先に明細が届くことがあるので外部キーにしない） */
  account: text('account').notNull(),
  occurredOn: date('occurred_on').$type<DateString>().notNull(),
  description: text('description').notNull(),
  /** 円。入金は正、出金は負 */
  amount: integer('amount').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export type MoneyTransactionRow = typeof moneyTransactions.$inferSelect;
