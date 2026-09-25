import DeleteIcon from '@mui/icons-material/Delete';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { FILL_TEXT } from '../../../../shared/color.ts';
import { formatDateWithYear } from '../../../lib/date.ts';
import { RecordSheet } from '../../../lib/ui/RecordSheet.tsx';
import { useRecordDetail } from '../../../lib/ui/use-record-detail.ts';
import { type ItemColors, useUserColor } from '../../users/use-user-color.ts';
import { useUserLabels } from '../../users/use-user-labels.ts';
import { formatYen } from '../format.ts';
import { type Expense, useDeleteExpense, useUpdateExpense } from '../queries.ts';
import { useExpenseForm } from '../use-expense-form.ts';
import { ExpenseFields } from './ExpenseFields.tsx';

type Props = {
  expense: Expense;
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
  const { label } = useUserLabels();
  const colorFor = useUserColor();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();
  const detail = useRecordDetail({
    initialEditing,
    confirmDelete: 'この立替を削除しますか？',
    remove: () => deleteExpense.mutate(expense.id),
    onClose,
  });
  const {
    amount,
    setAmount,
    parties,
    setTo,
    setFrom,
    errors,
    submitError,
    submitted,
    handleSubmit,
  } = useExpenseForm({
    initial: expense,
    onSubmit: (input) => updateExpense.mutateAsync({ id: expense.id, ...input }),
    onSaved: onClose,
  });

  return (
    <RecordSheet
      title={expense.description}
      open={!submitted}
      onClose={onClose}
      editing={detail.editing}
      onEdit={detail.startEdit}
      actions={[{ label: '削除', icon: <DeleteIcon />, danger: true, onClick: detail.remove }]}
      onSubmit={handleSubmit}
      error={submitError}
    >
      {detail.editing ? (
        <ExpenseFields
          initial={expense}
          parties={parties}
          onChangeTo={setTo}
          onChangeFrom={setFrom}
          amount={amount}
          onChangeAmount={setAmount}
          errors={errors}
        />
      ) : (
        <>
          <Typography variant="h5" component="p" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatYen(expense.amount)}
          </Typography>
          <Typography>{formatDateWithYear(expense.spentOn)}</Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
            <UserChip
              label={`To: ${label(expense.toUserId)}`}
              colors={colorFor(expense.toUserId)}
            />
            <UserChip
              label={`From: ${label(expense.fromUserId)}`}
              colors={colorFor(expense.fromUserId)}
            />
          </Stack>
        </>
      )}
    </RecordSheet>
  );
}

/** To・From の 1 つ。そのユーザーの色で塗る */
function UserChip({ label, colors }: { label: string; colors: ItemColors }) {
  return <Chip size="small" label={label} sx={{ bgcolor: colors.fill, color: FILL_TEXT }} />;
}
