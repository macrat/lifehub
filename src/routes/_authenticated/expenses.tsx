import AddIcon from '@mui/icons-material/Add';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { createFileRoute } from '@tanstack/react-router';
import { BalanceSummary } from '../../features/expenses/components/BalanceSummary.tsx';
import { ExpenseDetailSheet } from '../../features/expenses/components/ExpenseDetailSheet.tsx';
import { ExpenseFilterForm } from '../../features/expenses/components/ExpenseFilterForm.tsx';
import { ExpenseForm } from '../../features/expenses/components/ExpenseForm.tsx';
import { ExpenseList } from '../../features/expenses/components/ExpenseList.tsx';
import { type Expense, useBalance, useExpenseHistory } from '../../features/expenses/queries.ts';
import { countActiveFilters, expenseSearchSchema } from '../../features/expenses/search.ts';
import { useAddShortcut } from '../../lib/add-search.ts';
import { useFilterSearch } from '../../lib/search.ts';
import { AppBarContent } from '../../lib/ui/app-bar-slot.tsx';
import { FilterButton } from '../../lib/ui/FilterButton.tsx';
import { FAB_SX } from '../../lib/ui/layout.ts';
import { QueryView } from '../../lib/ui/QueryView.tsx';
import { SearchField } from '../../lib/ui/SearchField.tsx';
import { useRecordSelection } from '../../lib/ui/use-record-selection.ts';
import { useToggle } from '../../lib/ui/use-toggle.ts';

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
  const { filters, listFilter, setKeyword, setFilters, activeFilters, filtering } = useFilterSearch(
    search,
    countActiveFilters,
  );
  // 詳細な絞り込みのフォームを開いているか（URL には載せない。開き直したら閉じている）
  const panel = useToggle();
  const balanceQuery = useBalance();
  const history = useExpenseHistory(listFilter);
  const adding = useToggle();
  const selection = useRecordSelection<Expense>();

  useAddShortcut(search.add, adding.on);

  const header = (
    <>
      <ExpenseFilterForm open={panel.value} filters={filters} onChange={setFilters} />
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
          <FilterButton open={panel.value} count={activeFilters} onToggle={panel.toggle} />
        </SearchField>
      </AppBarContent>

      <ExpenseList
        history={history}
        header={header}
        emptyMessage={filtering ? '一致する立替はありません' : 'まだ立替はありません'}
        onSelect={selection.open}
      />

      <Fab color="primary" aria-label="立替を追加" onClick={adding.on} sx={FAB_SX}>
        <AddIcon />
      </Fab>
      {adding.value && <ExpenseForm onClose={adding.off} />}
      {selection.selected && (
        <ExpenseDetailSheet
          expense={selection.selected.record}
          initialEditing={selection.selected.editing}
          onClose={selection.close}
        />
      )}
    </>
  );
}
