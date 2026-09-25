import type { ExpenseInput } from '../../../shared/validation/expenses.ts';

/** 立替の To（誰のために払ったか。null は共有）と From（払った人）の組 */
export type Parties = Pick<ExpenseInput, 'toUserId' | 'fromUserId'>;

/** To の選択肢。本人から本人へは払えないので、From の人を外す */
export function toCandidates<T extends { id: string }>(users: T[], parties: Parties): T[] {
  return users.filter((u) => u.id !== parties.fromUserId);
}

/**
 * From を選び直す。To にいる人を From に選んだら、それまでの From を To に回す（2 つを入れ替える）。
 * To 側では From の人を選べない（`toCandidates`）ので、入れ替えは From 側でだけ起きる。
 * From 側で弾かずに入れ替えにするのは、To と From を逆に入れてしまったときに 1 回の操作で直せるようにするため。
 */
export function chooseFrom(parties: Parties, fromUserId: string): Parties {
  return {
    fromUserId,
    toUserId: parties.toUserId === fromUserId ? parties.fromUserId : parties.toUserId,
  };
}
