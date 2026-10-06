import type { MoneyTransaction } from './queries.ts';

/** 入出金の補足の行（「テストカード・食費 / 外食」）。履歴の行と詳細で同じ並びにする */
export function transactionCaption({ account, category }: MoneyTransaction): string {
  return category ? `${account}・${category}` : account;
}
