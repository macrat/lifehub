import type { DateString } from '../../../../shared/types.ts';
import { LedgerList, type LedgerListProps } from '../../../lib/ui/LedgerList.tsx';
import { formatSignedYen } from '../../../lib/yen.ts';
import { useUserColor } from '../../users/use-user-color.ts';
import type { MoneyTransaction } from '../queries.ts';
import { transactionCaption } from '../transaction-view.ts';

const occurredOn = (transaction: MoneyTransaction): DateString => transaction.occurredOn;
const amountOf = (transaction: MoneyTransaction) => formatSignedYen(transaction.amount);
const descriptionOf = (transaction: MoneyTransaction) => transaction.description;

type Props = Pick<
  LedgerListProps<MoneyTransaction>,
  'history' | 'header' | 'headerScrollsAway' | 'emptyMessage'
> & {
  onSelect: (transaction: MoneyTransaction) => void;
};

/**
 * 入出金の履歴（`LedgerList`。`transactionHistory` を画面が `useScreenHistory` で購読して渡す）。
 * 印は無彩色の点（取り込んだ入出金は人に結び付かない。タイムラインの丸も同じ色）、金額は入金に + を付ける。
 * 読むだけの記録なので、長押しも単押しと同じく詳細を開く。
 */
export function TransactionList({ onSelect, ...props }: Props) {
  const mark = useUserColor()(null).mark;
  return (
    <LedgerList
      {...props}
      dayOf={occurredOn}
      amountOf={amountOf}
      markColorsOf={() => [mark]}
      titleOf={descriptionOf}
      captionOf={transactionCaption}
      onSelect={(transaction) => onSelect(transaction)}
    />
  );
}
