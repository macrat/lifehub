import { compareKeys } from './sort.ts';
import type { DateString } from './types.ts';

/**
 * Money Forward から取り込んだ口座と入出金。サーバーの一覧と、クライアントの表示が同じ形を使うため、共通に置く。
 */

/**
 * 取り込む口座の種類（サーバーの環境変数 `MONEYFORWARD_ACCOUNTS` で口座ごとに指定する）。
 * 種類でお金の画面のカードに出す値が変わる: 銀行は残高、証券は評価額、クレジットカードは次回の引き落とし。
 */
export const MONEY_ACCOUNT_KINDS = ['bank', 'securities', 'card'] as const;
type MoneyAccountKind = (typeof MONEY_ACCOUNT_KINDS)[number];

/** お金の画面のカード 1 枚。並びは環境変数に書いた順 */
export type MoneyAccount = {
  /** Money Forward での金融機関の名前（環境変数に書いた名前） */
  name: string;
  kind: MoneyAccountKind;
  /** 銀行の残高・証券の評価額（円）。クレジットカード、まだ取り込んでいない、または読めなかったら null */
  balance: number | null;
  /** クレジットカードの次回の引き落とし額（円）。カード以外、または読めなかったら null */
  withdrawalAmount: number | null;
  /** クレジットカードの次回の引き落とし日。カード以外、または読めなかったら null */
  withdrawalOn: DateString | null;
  /** 最後に取り込んだ日時（ISO）。まだ取り込んでいなければ null */
  fetchedAt: string | null;
};

/** Money Forward から取り込んだ入出金 1 件 */
export type MoneyTransaction = {
  id: string;
  /** 金融機関の名前（`MoneyAccount` の name） */
  account: string;
  occurredOn: DateString;
  description: string;
  /** 円。入金は正、出金は負 */
  amount: number;
  /** Money Forward の分類（「食費 / 外食」）。未分類なら null */
  category: string | null;
};

/**
 * 1 日の中の並び（古い順。履歴は画面で逆さに出す）。同じ日の中で時刻を持たないので、取り込みの ID の順にする。
 * 並びはサーバーとクライアントで同じでなければならないので、符号位置で比べる（`compareKeys`）
 */
export function sortTransactions(items: MoneyTransaction[]): MoneyTransaction[] {
  return items.toSorted(
    (a, b) => compareKeys(a.occurredOn, b.occurredOn) || compareKeys(a.id, b.id),
  );
}
