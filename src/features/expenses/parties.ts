import type { Settlement } from '../../../shared/expenses.ts';
import type { ExpenseInput } from '../../../shared/validation/expenses.ts';

/** 立替の To（誰のために払ったか）と From（払った人）の組。null は共有 */
export type Parties = Pick<ExpenseInput, 'toUserId' | 'fromUserId'>;

/**
 * To の選択肢。自分から自分へは払えないので、From の人を外す。
 * 共有（null）は選択肢の固定の項目なので、From が共有のときに外すのは入力欄が受け持つ（`canChooseSharedTo`）
 */
export function toCandidates<T extends { id: string }>(users: T[], parties: Parties): T[] {
  return users.filter((u) => u.id !== parties.fromUserId);
}

/** To に共有を選べるか。共有から共有へは払えない */
export function canChooseSharedTo(parties: Parties): boolean {
  return parties.fromUserId !== null;
}

/**
 * From を選び直す。To にいる相手（共有を含む）を From に選んだら、それまでの From を To に回す（2 つを入れ替える）。
 * To 側では From の相手を選べない（`toCandidates`、`canChooseSharedTo`）ので、入れ替えは From 側でだけ起きる。
 * From 側で弾かずに入れ替えにするのは、To と From を逆に入れてしまったときに 1 回の操作で直せるようにするため。
 */
export function chooseFrom(parties: Parties, fromUserId: string | null): Parties {
  return {
    fromUserId,
    toUserId: parties.toUserId === fromUserId ? parties.fromUserId : parties.toUserId,
  };
}

/**
 * 名前と印の色を並べる順の相手（ユーザー ID。null は共有）。簿記に倣って「To ← From」の順で、
 * 共有のための支払い（To が null）なら払った人だけ、共有からの引き出し（From が null）なら「To ← 共有」。
 * 立替の履歴（`ExpenseList`）とホームのタイムラインの行が同じ並びで出すため、1 か所で決める。
 */
export function partiesInOrder({ toUserId, fromUserId }: Parties): (string | null)[] {
  return toUserId === null ? [fromUserId] : [toUserId, fromUserId];
}

/** 並べた相手の名前をつなぐ印（「To ← From」） */
export const PARTIES_SEPARATOR = ' ← ';

/** 精算の内容の既定値 */
const SETTLEMENT_DESCRIPTION = '精算';

/**
 * 精算を立替として入れる値。債務者が債権者のために払った行にすると、その分の貸し借りが打ち消される
 * （From = 払う債務者、To = 受け取る債権者）
 */
export function settlementExpense(s: Settlement): Partial<ExpenseInput> {
  return {
    fromUserId: s.debtorId,
    toUserId: s.creditorId,
    amount: s.amount,
    description: SETTLEMENT_DESCRIPTION,
  };
}
