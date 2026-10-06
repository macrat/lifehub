import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { formatDateWithYear } from '../../../lib/date.ts';
import { RecordSheet } from '../../../lib/ui/RecordSheet.tsx';
import { formatYen } from '../../../lib/yen.ts';
import { UserChip } from '../../users/components/UserChip.tsx';
import type { MoneyRecord } from '../queries.ts';
import { useExpenseDetail } from '../use-expense-detail.ts';
import { ExpenseFields } from './ExpenseFields.tsx';

type Props = {
  expense: MoneyRecord;
  /** 開いた時点から入力欄にするか（行を長押しで開いたとき） */
  initialEditing?: boolean;
  onClose: () => void;
};

/**
 * 立替の詳細。鉛筆で同じシートの中が入力欄に変わり、三点リーダーから削除する。
 * 表示ではフォームと同じ To（誰のために）・From（払った人）で内訳を見せ、
 * それぞれをそのユーザーの色で塗って、一覧の印の点と同じ色で誰かが分かるようにする。
 * 呼び出し側が項目を選んでいる間だけマウントする（閉じれば編集中の状態も消える）。
 */
export function ExpenseDetailSheet({ expense, initialEditing = false, onClose }: Props) {
  const detail = useExpenseDetail(expense, initialEditing, onClose);

  return (
    <RecordSheet title={expense.description} {...detail.sheet}>
      {detail.editing ? (
        <ExpenseFields {...detail.fields} />
      ) : (
        <>
          <Typography variant="h5" component="p" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatYen(expense.amount)}
          </Typography>
          <Typography>{formatDateWithYear(expense.occurredOn)}</Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            <UserChip prefix="To" userId={expense.toUserId} />
            <UserChip prefix="From" userId={expense.fromUserId} />
          </Stack>
        </>
      )}
    </RecordSheet>
  );
}
