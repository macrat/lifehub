import AddIcon from '@mui/icons-material/Add';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { BalanceSummary } from '../../features/expenses/components/BalanceSummary.tsx';
import { ExpenseForm } from '../../features/expenses/components/ExpenseForm.tsx';
import { ExpenseList } from '../../features/expenses/components/ExpenseList.tsx';
import {
  balanceQueryOptions,
  expensesQueryOptions,
  useAddExpense,
  useDeleteExpense,
} from '../../features/expenses/queries.ts';
import { ensureData } from '../../lib/query-client.ts';
import { FAB_SX } from '../../lib/ui/AppShell.tsx';

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
  const addExpense = useAddExpense();
  const deleteExpense = useDeleteExpense();
  const [adding, setAdding] = useState(false);

  return (
    <>
      <Box sx={{ px: 2, py: 1.5 }}>
        <Typography variant="body2" color="text.secondary">
          残高
        </Typography>
        {balance && <BalanceSummary balance={balance} />}
      </Box>

      <ExpenseList expenses={expenses} onDelete={(id) => deleteExpense.mutate(id)} />

      <Fab color="primary" aria-label="立替を追加" onClick={() => setAdding(true)} sx={FAB_SX}>
        <AddIcon />
      </Fab>
      {adding && <ExpenseForm onSubmit={addExpense.mutate} onClose={() => setAdding(false)} />}
    </>
  );
}
