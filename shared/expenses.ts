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
 */
export function computeBalance(expenses: Expense[], [a, b]: [string, string]): Balance {
  const total = (from: string, to: string | null) =>
    sum(expenses.filter((e) => e.fromUserId === from && e.toUserId === to).map((e) => e.amount));
  const claimOfA = Math.trunc((total(a, null) - total(b, null)) / 2) + total(a, b) - total(b, a);
  if (claimOfA === 0) return { amount: 0, fromUserId: null, toUserId: null };
  return claimOfA > 0
    ? { amount: claimOfA, fromUserId: b, toUserId: a }
    : { amount: -claimOfA, fromUserId: a, toUserId: b };
}

/** 一覧の並び: 使った日の新しい順、同じ日なら登録の新しい順 */
export function sortExpenses(expenses: Expense[]): Expense[] {
  return [...expenses].sort(
    (x, y) => y.spentOn.localeCompare(x.spentOn) || y.createdAt.localeCompare(x.createdAt),
  );
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}
