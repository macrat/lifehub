import DeleteIcon from '@mui/icons-material/Delete';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { formatDateWithYear } from '../../../lib/date.ts';
import { RecordSheet } from '../../../lib/ui/RecordSheet.tsx';
import { type ItemColors, useFillText, useUserColor } from '../../users/use-user-color.ts';
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
  const [editing, setEditing] = useState(initialEditing);
  const { amount, setAmount, errors, submitError, submitted, handleSubmit } = useExpenseForm({
    initial: expense,
    onSubmit: (input) => updateExpense.mutateAsync({ id: expense.id, ...input }),
    onSaved: onClose,
  });

  return (
    <RecordSheet
      title={expense.description}
      open={!submitted}
      onClose={onClose}
      editing={editing}
      onEdit={() => setEditing(true)}
      actions={[
        {
          label: '削除',
          icon: <DeleteIcon />,
          danger: true,
          onClick: () => {
            if (!window.confirm('この立替を削除しますか？')) return;
            deleteExpense.mutate(expense.id);
            onClose();
          },
        },
      ]}
      onSubmit={handleSubmit}
      error={submitError}
    >
      {editing ? (
        <ExpenseFields
          initial={expense}
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
  const text = useFillText();
  return <Chip size="small" label={label} sx={{ bgcolor: colors.fill, color: text }} />;
}
