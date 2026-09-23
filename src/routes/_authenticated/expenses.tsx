import AddIcon from '@mui/icons-material/Add';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { AddExpenseForm } from '../../features/add/components/AddForm.tsx';
import { useAddShortcut } from '../../features/add/shortcut.ts';
import { BalanceSummary } from '../../features/expenses/components/BalanceSummary.tsx';
import { ExpenseDetailSheet } from '../../features/expenses/components/ExpenseDetailSheet.tsx';
import { ExpenseFilterForm } from '../../features/expenses/components/ExpenseFilterForm.tsx';
import { ExpenseList } from '../../features/expenses/components/ExpenseList.tsx';
import { type Expense, useBalance, useExpenseHistory } from '../../features/expenses/queries.ts';
import { expenseSearchSchema, useExpenseSearch } from '../../features/expenses/search.ts';
import { FAB_SX } from '../../lib/ui/AppShell.tsx';
import { AppBarContent } from '../../lib/ui/app-bar-slot.tsx';
import { FilterButton } from '../../lib/ui/FilterButton.tsx';
import { QueryView } from '../../lib/ui/QueryView.tsx';
import { SearchField } from '../../lib/ui/SearchField.tsx';

export const Route = createFileRoute('/_authenticated/expenses')({
  validateSearch: expenseSearchSchema,
  component: ExpensesPage,
});

/**
 * 立替（借方・貸方）。残高と履歴。精算は専用の操作ではなく「誰かが誰かに払った額」を立替として追加する。
 * 履歴は上が古く下が新しい無限スクロールで、最初は一番下（最新）を出し、上へ戻ると古いほうのページを読む。絞り込みのフォームと残高は
 * 一覧の上に貼り付けて、どこまでスクロールしても隠れない。
 * 履歴は日ごとの見出しと 1 件 1 行（カレンダーのリスト表示と同じ体裁）。行を単押しすると詳細、長押しすると
 * その詳細が編集で開く（アプリ全体の「単押しは閲覧、長押しは編集」）。削除は詳細の三点リーダーの中。
 * AppBar の検索窓は内容で履歴を絞り込み（絞り込みはサーバーが掛ける）、その右の絞り込みボタンで金額・日付の範囲と To・From の
 * 詳細な検索を AppBar の下に開く（残高は絞り込みに関わらず全体の貸借を示す）。
 */
function ExpensesPage() {
  const search = Route.useSearch();
  const { filters, listFilter, activeFilters, setKeyword, setFilters } = useExpenseSearch(search);
  const balanceQuery = useBalance();
  const history = useExpenseHistory(listFilter);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  // 開いている記録と、どちらの顔（閲覧・編集）で開いたか
  const [selected, setSelected] = useState<{ expense: Expense; editing: boolean } | null>(null);
  const filtering = filters.q !== '' || activeFilters > 0;

  useAddShortcut(search.add, () => setAdding(true));

  const header = (
    <>
      <ExpenseFilterForm open={filtersOpen} filters={filters} onChange={setFilters} />
      <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
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
    </>
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

      <ExpenseList
        history={history}
        header={header}
        emptyMessage={filtering ? '一致する立替はありません' : 'まだ立替はありません'}
        onSelect={(expense, editing) => setSelected({ expense, editing })}
      />

      <Fab color="primary" aria-label="立替を追加" onClick={() => setAdding(true)} sx={FAB_SX}>
        <AddIcon />
      </Fab>
      {adding && <AddExpenseForm onClose={() => setAdding(false)} />}
      {selected && (
        <ExpenseDetailSheet
          expense={selected.expense}
          initialEditing={selected.editing}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
