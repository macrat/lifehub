import type { DateString } from '../../../../shared/types.ts';
import { LedgerList, type LedgerListProps } from '../../../lib/ui/LedgerList.tsx';
import { formatYen } from '../../../lib/yen.ts';
import { useUserColor } from '../../users/use-user-color.ts';
import { useUserLabels } from '../../users/use-user-labels.ts';
import { partiesInOrder, partiesLabel } from '../parties.ts';
import type { Expense } from '../queries.ts';

const spentOn = (expense: Expense): DateString => expense.spentOn;
const amountOf = (expense: Expense) => formatYen(expense.amount);
const descriptionOf = (expense: Expense) => expense.description;

type Props = Pick<
  LedgerListProps<Expense>,
  'history' | 'header' | 'headerScrollsAway' | 'emptyMessage' | 'onSelect'
>;

/**
 * 立替の履歴（`LedgerList`。`expenseHistory` を画面が `useScreenHistory` で購読して渡す）。日は使った日。
 * 名前は共有なら払った人だけ、相手が決まっていれば簿記の並びで「To ← From」（`partiesInOrder`）。
 * 印も同じ並びで、共有のために払ったものは払った人 1 色の円、人から人へのものは左を To・右を From の円にする。
 */
export function ExpenseList(props: Props) {
  const { label } = useUserLabels();
  const colorFor = useUserColor();
  return (
    <LedgerList
      {...props}
      dayOf={spentOn}
      amountOf={amountOf}
      markColorsOf={(expense) => partiesInOrder(expense).map((id) => colorFor(id).mark)}
      titleOf={descriptionOf}
      captionOf={(expense) => partiesLabel(partiesInOrder(expense), label)}
    />
  );
}
