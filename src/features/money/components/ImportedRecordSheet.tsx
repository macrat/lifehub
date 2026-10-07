import Typography from '@mui/material/Typography';
import type { MoneyRecord } from '../../../../shared/money.ts';
import { formatDateWithYear } from '../../../lib/date.ts';
import { RecordSheet } from '../../../lib/ui/RecordSheet.tsx';
import { formatSignedYen } from '../../../lib/yen.ts';

type Props = {
  /** 取り込んだ入出金（account を持つお金の記録） */
  record: MoneyRecord;
  onClose: () => void;
};

/**
 * 入出金の詳細。Money Forward から取り込んだもので LifeHub からは直せないので、鉛筆も三点リーダーも出さない
 * （直すのは Money Forward で。次の取り込みで反映される）。入れ物はほかの記録と同じ `RecordSheet`。
 */
export function ImportedRecordSheet({ record, onClose }: Props) {
  return (
    <RecordSheet
      title={record.description}
      editing={false}
      onClose={onClose}
      onSubmit={(event) => event.preventDefault()}
    >
      <Typography variant="h5" component="p" sx={{ fontVariantNumeric: 'tabular-nums' }}>
        {formatSignedYen(record.amount)}
      </Typography>
      <Typography>{formatDateWithYear(record.occurredOn)}</Typography>
      <Typography color="textSecondary">{record.account}</Typography>
    </RecordSheet>
  );
}
