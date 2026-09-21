import AddIcon from '@mui/icons-material/Add';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { BalanceSummary } from '../../features/expenses/components/BalanceSummary.tsx';
import { ExpenseDetailDialog } from '../../features/expenses/components/ExpenseDetailDialog.tsx';
import { ExpenseForm } from '../../features/expenses/components/ExpenseForm.tsx';
import { ExpenseList } from '../../features/expenses/components/ExpenseList.tsx';
import {
  balanceQueryOptions,
  type Expense,
  expensesQueryOptions,
  useAddExpense,
} from '../../features/expenses/queries.ts';
import { ensureData } from '../../lib/query-client.ts';
import { keywordSearchSchema, matchesKeyword } from '../../lib/search.ts';
import { FAB_SX } from '../../lib/ui/AppShell.tsx';
import { AppBarContent } from '../../lib/ui/app-bar-slot.tsx';
import { SearchField } from '../../lib/ui/SearchField.tsx';

export const Route = createFileRoute('/_authenticated/expenses')({
  validateSearch: keywordSearchSchema,
  loader: ({ context }) =>
    Promise.all([
      ensureData(context.queryClient, balanceQueryOptions),
      ensureData(context.queryClient, expensesQueryOptions),
    ]),
  component: ExpensesPage,
});

/**
 * 立替（借方・貸方）。残高と履歴。精算は専用の操作ではなく「誰かが誰かに払った額」を立替として追加する。
 * 履歴の行は共有なら From だけ、相手が決まっていれば「From → To」。行をタップすると詳細（編集・削除）が開く。
 * AppBar の検索窓は内容で履歴を絞り込む（残高は絞り込みに関わらず全体の貸借を示す）。
 */
function ExpensesPage() {
  const { q } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: balance } = useQuery(balanceQueryOptions);
  const { data: expenses = [] } = useQuery(expensesQueryOptions);
  const addExpense = useAddExpense();
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Expense | null>(null);

  const keyword = q ?? '';
  const found = expenses.filter((e) => matchesKeyword(keyword, e.description));

  return (
    <>
      <AppBarContent>
        <SearchField
          label="内容を検索"
          value={keyword}
          onChange={(value) =>
            // 打つたびに履歴が積み上がらないよう置き換える。スクロール位置も動かさない
            navigate({ search: { q: value || undefined }, replace: true, resetScroll: false })
          }
        />
      </AppBarContent>

      <Box sx={{ px: 2, py: 1.5 }}>
        <Typography variant="body2" color="text.secondary">
          残高
        </Typography>
        {balance && <BalanceSummary balance={balance} />}
      </Box>

      <ExpenseList
        expenses={found}
        emptyMessage={keyword ? '一致する立替はありません' : 'まだ立替はありません'}
        onSelect={setSelected}
      />

      <Fab color="primary" aria-label="立替を追加" onClick={() => setAdding(true)} sx={FAB_SX}>
        <AddIcon />
      </Fab>
      {adding && <ExpenseForm onSubmit={addExpense.mutateAsync} onClose={() => setAdding(false)} />}
      {selected && <ExpenseDetailDialog expense={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
