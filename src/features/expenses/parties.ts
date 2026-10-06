import type { Settlement } from '../../../shared/expenses.ts';
import { type ExpenseInput, SHARED } from '../../../shared/validation/expenses.ts';

/** 立替の当事者（ユーザー ID。null は共有） */
export type Party = string | null;

/** 立替の To（誰のために払ったか）と From（払った人）の組 */
export type Parties = Pick<ExpenseInput, 'toUserId' | 'fromUserId'>;

/** From の選択肢: 共有（先頭）とユーザー */
export function fromCandidates(users: { id: string }[]): Party[] {
  return [null, ...users.map((u) => u.id)];
}

/**
 * 絞り込みの To・From の選択肢: フォームの From と同じ並び（共有が先頭）。共有は URL に載せる値（`SHARED`）で持つ
 */
export function partyFilterOptions(
  users: { id: string }[],
  label: (party: Party) => string,
): { value: string; label: string }[] {
  return fromCandidates(users).map((party) => ({ value: party ?? SHARED, label: label(party) }));
}

/** To の選択肢。自分から自分へは払えないので、From の相手を外す（共有から共有も同じく外れる） */
export function toCandidates(users: { id: string }[], parties: Parties): Party[] {
  return fromCandidates(users).filter((p) => p !== parties.fromUserId);
}

/**
 * From を選び直す。To にいる相手（共有を含む）を From に選んだら、それまでの From を To に回す（2 つを入れ替える）。
 * To 側では From の相手を選べない（`toCandidates`）ので、入れ替えは From 側でだけ起きる。
 * From 側で弾かずに入れ替えにするのは、To と From を逆に入れてしまったときに 1 回の操作で直せるようにするため。
 */
export function chooseFrom(parties: Parties, fromUserId: Party): Parties {
  return {
    fromUserId,
    toUserId: parties.toUserId === fromUserId ? parties.fromUserId : parties.toUserId,
  };
}

/**
 * 名前と印の色を並べる順の相手（ユーザー ID。null は共有）。簿記に倣って「To ← From」の順で、
 * 共有のための支払い（To が null）なら払った人だけ、共有からの引き出し（From が null）なら「To ← 共有」。
 * お金の画面の一覧（`MoneyList`）とホームのタイムラインの行が同じ並びで出すため、1 か所で決める。
 */
export function partiesInOrder({ toUserId, fromUserId }: Parties): Party[] {
  return toUserId === null ? [fromUserId] : [toUserId, fromUserId];
}

/** 並べた相手の名前（「To ← From」）。履歴・タイムライン・精算のタイルが同じ書き方で出す */
export function partiesLabel(parties: Party[], label: (party: Party) => string): string {
  return parties.map(label).join(' ← ');
}

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
