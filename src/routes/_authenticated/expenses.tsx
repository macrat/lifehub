import Box from '@mui/material/Box';
import { createFileRoute } from '@tanstack/react-router';
import { ExpenseDetailSheet } from '../../features/expenses/components/ExpenseDetailSheet.tsx';
import { ExpenseFilterForm } from '../../features/expenses/components/ExpenseFilterForm.tsx';
import { ExpenseForm } from '../../features/expenses/components/ExpenseForm.tsx';
import { ExpenseList } from '../../features/expenses/components/ExpenseList.tsx';
import {
  SettlementGrid,
  SettlementGridSkeleton,
} from '../../features/expenses/components/SettlementGrid.tsx';
import { settlementExpense } from '../../features/expenses/parties.ts';
import {
  type Expense,
  type ExpenseBody,
  expenseHistory,
  totalsQueryOptions,
  useSettlements,
} from '../../features/expenses/queries.ts';
import { EXPENSE_FILTER_CONDITIONS, expenseSearchSchema } from '../../features/expenses/search.ts';
import { useAddShortcut } from '../../lib/add-search.ts';
import { useScreenHistory, useScreenQueries } from '../../lib/screen-data.ts';
import { useFilterSearch } from '../../lib/search.ts';
import { AddFab } from '../../lib/ui/AddFab.tsx';
import { AppBarContent } from '../../lib/ui/app-bar-slot.tsx';
import { FilterSearchField } from '../../lib/ui/FilterSearchField.tsx';
import { QueryView } from '../../lib/ui/QueryView.tsx';
import { useRecordSelection } from '../../lib/ui/use-record-selection.ts';
import { useOpenWith } from '../../lib/ui/use-toggle.ts';

export const Route = createFileRoute('/_authenticated/expenses')({
  validateSearch: expenseSearchSchema,
  staticData: { ownsScroll: true },
  component: ExpensesPage,
});

/**
 * 立替（ユーザーと共有の間の資金の貸し借り）。精算と履歴。精算は専用の操作ではなく「誰かが誰かに払った額」を立替として追加し、
 * 精算のタイルをタップするとその精算を入れた入力が開く。
 * 履歴は上が新しく下が古い無限スクロールで、最初に出す位置は `HistoryList` が決め、下へ進むと古いほうのページを読む。絞り込みのフォームと精算は
 * 一覧の上に貼り付け、ホームのタイルと同じく下へスクロールすると隠れ、少し戻すと出てくる（絞り込みのフォームを開いている間は隠さない）。
 * 履歴は日ごとの見出しと 1 件 1 行（カレンダーのリスト表示と同じ体裁）。行を単押しすると詳細、長押しすると
 * その詳細が編集で開く（アプリ全体の「単押しは閲覧、長押しは編集」）。削除は詳細の三点リーダーの中。
 * AppBar の検索窓は内容で履歴を絞り込み（絞り込みはサーバーが掛ける）、その右の絞り込みボタンで金額・日付の範囲と To・From の
 * 詳細な検索を AppBar の下に開く（精算は絞り込みに関わらず全体の貸借を示す）。
 */
function ExpensesPage() {
  const search = Route.useSearch();
  const filter = useFilterSearch(search, EXPENSE_FILTER_CONDITIONS);
  // この画面が読むもの: 精算の元になる合計と、絞り込んだ履歴
  useScreenQueries([totalsQueryOptions]);
  const history = useScreenHistory(expenseHistory, filter.listFilter);
  const settlementsQuery = useSettlements();
  // 追加のフォームと、最初に入れておく値（精算のタイルから開くとその精算）
  const adding = useOpenWith<Partial<ExpenseBody>>();
  const selection = useRecordSelection<Expense>();

  const openAdd = () => adding.open({});
  useAddShortcut(search.add, openAdd);

  const header = (
    <>
      <ExpenseFilterForm
        open={filter.panelOpen}
        filters={filter.filters}
        onChange={filter.setFilters}
      />
      <Box
        component="section"
        aria-label="精算"
        sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}
      >
        <QueryView query={settlementsQuery} skeleton={<SettlementGridSkeleton />}>
          {(settlements) => (
            <SettlementGrid
              settlements={settlements}
              onSelect={(s) => adding.open(settlementExpense(s))}
            />
          )}
        </QueryView>
      </Box>
    </>
  );

  return (
    <>
      <AppBarContent>
        <FilterSearchField label="立替を検索" search={filter} />
      </AppBarContent>

      <ExpenseList
        history={history}
        header={header}
        headerScrollsAway={!filter.panelOpen}
        emptyMessage={filter.emptyMessage('立替')}
        onSelect={selection.open}
      />

      <AddFab label="立替を追加" onClick={openAdd} />
      {adding.value && <ExpenseForm initial={adding.value} onClose={adding.close} />}
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
