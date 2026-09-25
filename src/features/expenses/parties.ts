/** 立替の To（誰のために払ったか。null は共有）と From（払った人）の組 */
export type Parties = { to: string | null; from: string };

/**
 * From を選び直す。To にいる人を From に選んだら、それまでの From を To に回す（2 つを入れ替える）。
 * To の選択肢からは From の人を外すので、To 側で同じ人を選ぶことは起きない。
 * From 側で弾かずに入れ替えにするのは、To と From を逆に入れてしまったときに 1 回の操作で直せるようにするため。
 */
export function chooseFrom(parties: Parties, from: string): Parties {
  return { from, to: parties.to === from ? parties.from : parties.to };
}
