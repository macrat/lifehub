import Typography from '@mui/material/Typography';
import { formatDateWithYear } from '../../../lib/date.ts';
import { RecordSheet } from '../../../lib/ui/RecordSheet.tsx';
import { formatSignedYen } from '../../../lib/yen.ts';
import type { MoneyRecord } from '../queries.ts';

type Props = {
  /** 取り込んだ入出金（account を持つお金の記録） */
  transaction: MoneyRecord;
  onClose: () => void;
};

/**
 * 入出金の詳細。Money Forward から取り込んだもので LifeHub からは直せないので、鉛筆も三点リーダーも出さない
 * （直すのは Money Forward で。次の取り込みで反映される）。入れ物はほかの記録と同じ `RecordSheet`。
 */
export function TransactionDetailSheet({ transaction, onClose }: Props) {
  return (
    <RecordSheet
      title={transaction.description}
      editing={false}
      onClose={onClose}
      onSubmit={(event) => event.preventDefault()}
    >
      <Typography variant="h5" component="p" sx={{ fontVariantNumeric: 'tabular-nums' }}>
        {formatSignedYen(transaction.amount)}
      </Typography>
      <Typography>{formatDateWithYear(transaction.occurredOn)}</Typography>
      <Typography color="textSecondary">{transaction.account}</Typography>
    </RecordSheet>
  );
}
