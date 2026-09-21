import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { formatDateWithYear } from '../../../lib/date.ts';
import { useUserLabels } from '../../users/use-user-labels.ts';
import { type Expense, useDeleteExpense, useUpdateExpense } from '../queries.ts';
import { formatYen } from './BalanceSummary.tsx';
import { ExpenseForm } from './ExpenseForm.tsx';

type Props = {
  expense: Expense;
  onClose: () => void;
};

/**
 * 立替の詳細。編集・削除の入口で、フォームと同じ To（誰のために）・From（払った人）で内訳を見せる。
 * 呼び出し側が項目を選んでいる間だけマウントする（閉じれば編集中の状態も消える）。
 */
export function ExpenseDetailDialog({ expense, onClose }: Props) {
  const { label } = useUserLabels();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();
  const [editing, setEditing] = useState(false);

  return (
    <>
      <Dialog open={!editing} onClose={onClose} fullWidth maxWidth="xs">
        <DialogTitle>{expense.description}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5}>
            <Typography variant="h5" component="p" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatYen(expense.amount)}
            </Typography>
            <Typography>{formatDateWithYear(expense.spentOn)}</Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
              <Chip size="small" label={`To: ${label(expense.toUserId)}`} />
              <Chip size="small" label={`From: ${label(expense.fromUserId)}`} />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          <Button
            color="error"
            startIcon={<DeleteIcon />}
            disabled={deleteExpense.isPending}
            onClick={async () => {
              if (!window.confirm('この立替を削除しますか？')) return;
              await deleteExpense.mutateAsync(expense.id);
              onClose();
            }}
          >
            削除
          </Button>
          <Button startIcon={<EditIcon />} onClick={() => setEditing(true)}>
            編集
          </Button>
          <Button variant="contained" onClick={onClose}>
            閉じる
          </Button>
        </DialogActions>
      </Dialog>

      {editing && (
        <ExpenseForm
          initial={expense}
          onSubmit={(input) => updateExpense.mutateAsync({ id: expense.id, ...input })}
          onClose={onClose}
        />
      )}
    </>
  );
}
