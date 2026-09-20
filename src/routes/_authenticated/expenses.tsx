import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import Button from '@mui/material/Button';
import Fab from '@mui/material/Fab';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { BalanceSummary, formatYen } from '../../features/expenses/components/BalanceSummary.tsx';
import { ExpenseForm } from '../../features/expenses/components/ExpenseForm.tsx';
import {
  balanceQueryOptions,
  expenseHistoryQueryOptions,
  useAddExpense,
  useDeleteExpense,
  useSettle,
} from '../../features/expenses/queries.ts';
import { useOwnerLabel } from '../../features/users/use-owner-label.ts';
import { formatDate } from '../../lib/date.ts';
import { ensureData } from '../../lib/query-client.ts';

export const Route = createFileRoute('/_authenticated/expenses')({
  loader: ({ context }) =>
    Promise.all([
      ensureData(context.queryClient, balanceQueryOptions),
      ensureData(context.queryClient, expenseHistoryQueryOptions),
    ]),
  component: ExpensesPage,
});

function ExpensesPage() {
  const { data: balance } = useQuery(balanceQueryOptions);
  const { data: history } = useQuery(expenseHistoryQueryOptions);
  const { label } = useOwnerLabel();
  const addExpense = useAddExpense();
  const deleteExpense = useDeleteExpense();
  const settle = useSettle();
  const [adding, setAdding] = useState(false);

  return (
    <>
      <Paper sx={{ px: 2, py: 1.5 }}>
        <Stack
          direction="row"
          spacing={2}
          sx={{
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            rowGap: 1,
          }}
        >
          <div>
            <Typography variant="body2" color="text.secondary">
              残高
            </Typography>
            {balance && <BalanceSummary balance={balance} />}
          </div>
          <Button
            variant="contained"
            disabled={!balance || balance.amount === 0 || settle.isPending}
            onClick={() => {
              if (window.confirm('現在の残高で精算しますか？')) settle.mutate();
            }}
          >
            精算する
          </Button>
        </Stack>
      </Paper>

      <Typography
        variant="subtitle2"
        component="h3"
        color="text.secondary"
        sx={{ px: 2, pt: 1.5, fontWeight: 600 }}
      >
        立替
      </Typography>
      <Paper>
        <List disablePadding>
          {history?.expenses.length === 0 && (
            <ListItem>
              <ListItemText secondary="まだ立替はありません" />
            </ListItem>
          )}
          {history?.expenses.map((e) => (
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
                secondary={`${formatDate(e.spentOn)} ・ ${label(e.paidBy)}が支払い`}
              />
            </ListItem>
          ))}
        </List>
      </Paper>

      <Typography
        variant="subtitle2"
        component="h3"
        color="text.secondary"
        sx={{ px: 2, pt: 1.5, fontWeight: 600 }}
      >
        精算
      </Typography>
      <Paper>
        <List disablePadding>
          {history?.settlements.length === 0 && (
            <ListItem>
              <ListItemText secondary="まだ精算はありません" />
            </ListItem>
          )}
          {history?.settlements.map((s) => (
            <ListItem key={s.id} divider>
              <ListItemText
                primary={`${label(s.fromUser)} → ${label(s.toUser)} ${formatYen(s.amount)}`}
                secondary={formatDate(s.settledOn)}
              />
            </ListItem>
          ))}
        </List>
      </Paper>

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
