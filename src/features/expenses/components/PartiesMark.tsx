import type { Parties } from '../../../../shared/money.ts';
import { VennMark } from '../../../lib/ui/VennMark.tsx';
import type { useUserColor } from '../../users/use-user-color.ts';
import { partiesInOrder } from '../parties.ts';

/**
 * 立替の当事者の印（お金の画面の一覧の印と同じ）。共有のために払ったものは払った人 1 色の円、人から人へのもの・共有からの
 * 引き出しは左が To・右が From の円を重ねる（共有は無彩色）。当事者を持たない物（ただの支出）は無彩色の点 1 つ。
 * 色は一覧が 1 度だけ引いて渡す（行ごとにユーザーと表示モードを購読しない）
 */
export function PartiesMark({
  parties,
  colorFor,
}: {
  parties: Parties | null;
  colorFor: ReturnType<typeof useUserColor>;
}) {
  const people = parties ? partiesInOrder(parties) : [null];
  return <VennMark colors={people.map((id) => colorFor(id).mark)} />;
}
