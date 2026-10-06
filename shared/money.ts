import type { Expense } from './expenses.ts';
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

/**
 * 口座の 1 日の値（残高の推移のグラフの 1 点）。amount は銀行なら残高、証券なら評価額、クレジットカードなら負債額
 * （使ってまだ払っていない額）を負の数で持つ。グラフでは負債を 0 より下へ積む
 */
export type MoneyBalance = { account: string; on: DateString; amount: number };

/**
 * 入出金の読み替えのルールの種別。spending はただの支出（精算に入れない）、deposit（入金）と withdrawal（出金）は
 * 対象者と「共有」との立替として精算に入れる: 入金は対象者が共有口座へ入れた（From 対象者 → To 共有）、
 * 出金は対象者が共有口座から引き出した（From 共有 → To 対象者）
 */
export const MONEY_RULE_KINDS = ['spending', 'deposit', 'withdrawal'] as const;
export type MoneyRuleKind = (typeof MONEY_RULE_KINDS)[number];

/**
 * 内容欄全体と一致させる正規表現。パターンを `(?:…)` で包んでから `^` と `$` を付けるので、`a|b` のような選択も
 * 全体に掛かる（そのまま付けると `^a|b$` になり、a で始まるか b で終わるだけで当たる）
 */
export function fullMatch(pattern: string): RegExp {
  return new RegExp(`^(?:${pattern})$`);
}

/** 立替の当事者（null は共有。`Expense` の From・To と同じ） */
export type Parties = { fromUserId: string | null; toUserId: string | null };

/** 入金・出金の向きと対象者から、立替の当事者 */
export function transferParties(
  direction: Exclude<MoneyRuleKind, 'spending'>,
  userId: string,
): Parties {
  return direction === 'deposit'
    ? { fromUserId: userId, toUserId: null }
    : { fromUserId: null, toUserId: userId };
}

/** Money Forward から取り込んだ入出金 1 件（内容欄はルールで読み替えた後） */
export type MoneyTransaction = {
  id: string;
  /** 金融機関の名前（`MoneyAccount` の name） */
  account: string;
  occurredOn: DateString;
  description: string;
  /** 円。入金は正、出金は負 */
  amount: number;
  /** ルールで「共有」との立替として精算に入れるときの当事者。ただの支出なら null */
  parties: Parties | null;
};

/**
 * お金の画面の一覧の 1 行: 立替か、取り込んだ入出金。id は一覧の中で一意な鍵（立替と入出金の ID が重ならないよう種類を付ける）
 */
export type MoneyEntry =
  | { type: 'expense'; id: string; expense: Expense }
  | { type: 'transaction'; id: string; transaction: MoneyTransaction };

export function expenseMoneyEntry(expense: Expense): MoneyEntry {
  return { type: 'expense', id: moneyEntryId('expense', expense.id), expense };
}

export function transactionMoneyEntry(transaction: MoneyTransaction): MoneyEntry {
  return { type: 'transaction', id: moneyEntryId('transaction', transaction.id), transaction };
}

/** 記録から一覧の行の鍵を作る。書き込みの楽観的更新が、同じ記録の行を引き当てるのに使う */
export function moneyEntryId(type: MoneyEntry['type'], id: string): string {
  return `${type}:${id}`;
}

/** 行の日（立替は使った日、入出金は日付）。ページはこの日で区切る */
export function moneyEntryDay(entry: MoneyEntry): DateString {
  return entry.type === 'expense' ? entry.expense.spentOn : entry.transaction.occurredOn;
}

/**
 * 並び: 日の古い順（一覧は画面で逆さに出す）。同じ日の中は、立替は記録した順（立替だけの一覧と同じ）、入出金は時刻を
 * 持たないのでその日の立替より前（画面では下）に取り込みの ID の順で置く。
 * 並びはサーバーとクライアントで同じでなければならないので、符号位置で比べる（`compareKeys`）
 */
export function sortMoneyEntries(entries: MoneyEntry[]): MoneyEntry[] {
  const key = (entry: MoneyEntry) => (entry.type === 'expense' ? entry.expense.createdAt : '');
  return entries.toSorted(
    (a, b) =>
      compareKeys(moneyEntryDay(a), moneyEntryDay(b)) ||
      compareKeys(key(a), key(b)) ||
      compareKeys(a.id, b.id),
  );
}
