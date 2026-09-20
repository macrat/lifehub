import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import Fab from '@mui/material/Fab';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { BalanceSummary, formatYen } from '../../features/expenses/components/BalanceSummary.tsx';
import { ExpenseForm } from '../../features/expenses/components/ExpenseForm.tsx';
import {
  balanceQueryOptions,
  expensesQueryOptions,
  useAddExpense,
  useDeleteExpense,
} from '../../features/expenses/queries.ts';
import { useOwnerLabel } from '../../features/users/use-owner-label.ts';
import { formatDate } from '../../lib/date.ts';
import { ensureData } from '../../lib/query-client.ts';

export const Route = createFileRoute('/_authenticated/expenses')({
  loader: ({ context }) =>
    Promise.all([
      ensureData(context.queryClient, balanceQueryOptions),
      ensureData(context.queryClient, expensesQueryOptions),
    ]),
  component: ExpensesPage,
});

/**
 * 立替（借方・貸方）。残高と履歴。精算は専用の操作ではなく「誰かが誰かに払った額」を立替として追加する。
 * 履歴の行は共有なら From だけ、相手が決まっていれば「From → To」。
 */
function ExpensesPage() {
  const { data: balance } = useQuery(balanceQueryOptions);
  const { data: expenses = [] } = useQuery(expensesQueryOptions);
  const { label } = useOwnerLabel();
  const addExpense = useAddExpense();
  const deleteExpense = useDeleteExpense();
  const [adding, setAdding] = useState(false);

  return (
    <>
      <div style={{ padding: '12px 16px' }}>
        <Typography variant="body2" color="text.secondary">
          残高
        </Typography>
        {balance && <BalanceSummary balance={balance} />}
      </div>

      <List disablePadding>
        {expenses.length === 0 && (
          <ListItem>
            <ListItemText secondary="まだ立替はありません" />
          </ListItem>
        )}
        {expenses.map((e) => (
          <ListItem
            key={e.id}
            divider
            secondaryAction={
              <IconButton
                edge="end"
                aria-label={`${e.description} を削除`}
                onClick={() => {
                  if (window.confirm('この立替を削除しますか？')) deleteExpense.mutate(e.id);
                }}
              >
                <DeleteIcon />
              </IconButton>
            }
          >
            <ListItemText
              primary={`${formatYen(e.amount)} ${e.description}`}
              secondary={`${formatDate(e.spentOn)} ・ ${
                e.toUserId === null
                  ? label(e.fromUserId)
                  : `${label(e.fromUserId)} → ${label(e.toUserId)}`
              }`}
            />
          </ListItem>
        ))}
      </List>

      <Fab
        color="primary"
        aria-label="立替を追加"
        onClick={() => setAdding(true)}
        sx={{
          position: 'fixed',
          right: 16,
          bottom: { xs: 'calc(56px + env(safe-area-inset-bottom) + 16px)', md: 24 },
        }}
      >
        <AddIcon />
      </Fab>
      {adding && (
        <ExpenseForm
          open
          onSubmit={(input) => addExpense.mutateAsync(input)}
          onClose={() => setAdding(false)}
        />
      )}
    </>
  );
}
