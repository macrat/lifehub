import AddIcon from '@mui/icons-material/Add';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { BalanceSummary } from '../../features/expenses/components/BalanceSummary.tsx';
import { ExpenseDetailSheet } from '../../features/expenses/components/ExpenseDetailSheet.tsx';
import { ExpenseFilterForm } from '../../features/expenses/components/ExpenseFilterForm.tsx';
import { ExpenseForm } from '../../features/expenses/components/ExpenseForm.tsx';
import { ExpenseList } from '../../features/expenses/components/ExpenseList.tsx';
import {
  balanceQueryOptions,
  type Expense,
  expensesQueryOptions,
  useAddExpense,
} from '../../features/expenses/queries.ts';
import {
  expenseSearchSchema,
  matchesExpense,
  useExpenseSearch,
} from '../../features/expenses/search.ts';
import { useAddShortcut } from '../../lib/add-shortcut.ts';
import { FAB_SX } from '../../lib/ui/AppShell.tsx';
import { AppBarContent } from '../../lib/ui/app-bar-slot.tsx';
import { FilterButton } from '../../lib/ui/FilterButton.tsx';
import { ListSkeleton, QueryView } from '../../lib/ui/QueryView.tsx';
import { SearchField } from '../../lib/ui/SearchField.tsx';

export const Route = createFileRoute('/_authenticated/expenses')({
  validateSearch: expenseSearchSchema,
  component: ExpensesPage,
});

/**
 * 立替（借方・貸方）。残高と履歴。精算は専用の操作ではなく「誰かが誰かに払った額」を立替として追加する。
 * 履歴の行は共有なら From だけ、相手が決まっていれば「From → To」。行をタップすると詳細（編集・削除）が開く。
 * AppBar の検索窓は内容で履歴を絞り込み、その右の絞り込みボタンで金額・日付の範囲と To・From の
 * 詳細な検索を AppBar の下に開く（残高は絞り込みに関わらず全体の貸借を示す）。
 * PWA のショートカットからは入力を開いた状態で始まる（`add=expense`）。
 */
function ExpensesPage() {
  const search = Route.useSearch();
  const { filters, activeFilters, setKeyword, setFilters } = useExpenseSearch(search);
  const balanceQuery = useQuery(balanceQueryOptions);
  const expensesQuery = useQuery(expensesQueryOptions);
  const addExpense = useAddExpense();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Expense | null>(null);
  const filtering = filters.q !== '' || activeFilters > 0;

  // PWA のショートカットから来たら入力を開く
  useAddShortcut(
    search.add,
    () => setAdding(true),
    () => setFilters({ add: undefined }),
  );

  return (
    <>
      <AppBarContent>
        <SearchField label="立替を検索" value={filters.q} onChange={setKeyword}>
          <FilterButton
            open={filtersOpen}
            count={activeFilters}
            onToggle={() => setFiltersOpen((v) => !v)}
          />
        </SearchField>
      </AppBarContent>

      <ExpenseFilterForm open={filtersOpen} filters={filters} onChange={setFilters} />

      <Box sx={{ px: 2, py: 1.5 }}>
        <Typography variant="body2" color="text.secondary">
          残高
        </Typography>
        <QueryView
          query={balanceQuery}
          skeleton={<Skeleton variant="text" width={180} height={40} />}
        >
          {(balance) => <BalanceSummary balance={balance} />}
        </QueryView>
      </Box>

      <QueryView query={expensesQuery} skeleton={<ListSkeleton />}>
        {(expenses) => (
          <ExpenseList
            expenses={expenses.filter((e) => matchesExpense(e, filters))}
            emptyMessage={filtering ? '一致する立替はありません' : 'まだ立替はありません'}
            onSelect={setSelected}
          />
        )}
      </QueryView>

      <Fab color="primary" aria-label="立替を追加" onClick={() => setAdding(true)} sx={FAB_SX}>
        <AddIcon />
      </Fab>
      {adding && <ExpenseForm onSubmit={addExpense.mutateAsync} onClose={() => setAdding(false)} />}
      {selected && <ExpenseDetailSheet expense={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
