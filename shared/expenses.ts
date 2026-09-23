/**
 * 立替の行と、そこから導かれる残高。
 * サーバーの一覧・残高と、クライアントの楽観的更新が同じ式を使うため、共通に置く。
 */

export type Expense = {
  id: string;
  fromUserId: string;
  /** null は共有（折半） */
  toUserId: string | null;
  amount: number;
  description: string;
  spentOn: string;
  createdAt: string;
};

/** 「誰が誰のために払ったか」ごとの合計。toUserId が null なら共有（折半） */
export type ExpenseTotal = {
  fromUserId: string;
  toUserId: string | null;
  amount: number;
};

/** 残高。fromUserId が toUserId に amount 円を支払うと精算される。0 なら両方 null */
export type Balance =
  | { amount: 0; fromUserId: null; toUserId: null }
  | { amount: number; fromUserId: string; toUserId: string };

/**
 * 立替残高（借方・貸方）。A が B に対して持つ債権 =
 *   (Σ A→共有 − Σ B→共有) / 2 + Σ A→B − Σ B→A
 * （X→Y = X が Y のために払った額。共有は折半。端数は切り捨て）
 * 精算も「B が A に払った」= B→A の行として同じ式に入るので、払えば債権が減る。
 * 利用者は 2 人固定で、登録順の先頭 2 人を A, B とする。
 *
 * 式はここ 1 か所だけに置く。サーバーは SQL で出した合計を渡し（全行を読まずに済む）、
 * クライアントは手元の履歴をそのまま渡す（Expense は ExpenseTotal として読める）ので、答えは必ず一致する。
 */
export function balanceOf(totals: ExpenseTotal[], [a, b]: [string, string]): Balance {
  const total = (from: string, to: string | null) =>
    sum(totals.filter((t) => t.fromUserId === from && t.toUserId === to).map((t) => t.amount));
  const claimOfA = Math.trunc((total(a, null) - total(b, null)) / 2) + total(a, b) - total(b, a);
  if (claimOfA === 0) return { amount: 0, fromUserId: null, toUserId: null };
  return claimOfA > 0
    ? { amount: claimOfA, fromUserId: b, toUserId: a }
    : { amount: -claimOfA, fromUserId: a, toUserId: b };
}

/**
 * 一覧の並び: 使った日の古い順、同じ日なら登録の古い順（アプリの一覧はどれも上が古く下が新しい）。
 * サーバーの `findAll` も同じ並びで返す
 */
export function sortExpenses(expenses: Expense[]): Expense[] {
  return [...expenses].sort(
    (x, y) => x.spentOn.localeCompare(y.spentOn) || x.createdAt.localeCompare(y.createdAt),
  );
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}
