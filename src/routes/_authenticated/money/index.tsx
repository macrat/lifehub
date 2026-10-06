import { createFileRoute } from '@tanstack/react-router';
import type { ExpenseInput } from '../../../../shared/validation/expenses.ts';
import { ExpenseDetailSheet } from '../../../features/expenses/components/ExpenseDetailSheet.tsx';
import { ExpenseFilterForm } from '../../../features/expenses/components/ExpenseFilterForm.tsx';
import { ExpenseForm } from '../../../features/expenses/components/ExpenseForm.tsx';
import { ExpenseList } from '../../../features/expenses/components/ExpenseList.tsx';
import {
  SettlementGrid,
  SettlementGridSkeleton,
} from '../../../features/expenses/components/SettlementGrid.tsx';
import { settlementExpense } from '../../../features/expenses/parties.ts';
import {
  type Expense,
  expenseHistory,
  totalsQueryOptions,
  useSettlements,
} from '../../../features/expenses/queries.ts';
import {
  EXPENSE_FILTER_CONDITIONS,
  expenseSearchSchema,
} from '../../../features/expenses/search.ts';
import { MoneyHeader, TileSection } from '../../../features/money/components/MoneyHeader.tsx';
import { accountsQueryOptions } from '../../../features/money/queries.ts';
import { useAddShortcut } from '../../../lib/add-search.ts';
import { useScreenHistory, useScreenQueries } from '../../../lib/screen-data.ts';
import { useFilterSearch } from '../../../lib/search.ts';
import { AddFab } from '../../../lib/ui/AddFab.tsx';
import { AppBarContent } from '../../../lib/ui/app-bar-slot.tsx';
import { FilterSearchField } from '../../../lib/ui/FilterSearchField.tsx';
import { QueryView } from '../../../lib/ui/QueryView.tsx';
import { useRecordSelection } from '../../../lib/ui/use-record-selection.ts';
import { useOpenWith } from '../../../lib/ui/use-toggle.ts';

export const Route = createFileRoute('/_authenticated/money/')({
  validateSearch: expenseSearchSchema,
  staticData: { ownsScroll: true },
  component: ExpensesPage,
});

/**
 * お金の画面の「立替」（下部ナビの「お金」で開く既定の一覧）。口座のタイル、精算、立替の履歴。
 * 精算は専用の操作ではなく「誰かが誰かに払った額」を立替として追加し、精算のタイルをタップするとその精算を入れた入力が開く。
 * 履歴は上が新しく下が古い無限スクロールで、タイル・タブと絞り込みのフォームは一覧の上に貼り付け、
 * 下へスクロールすると隠れ、少し戻すと出てくる（絞り込みのフォームを開いている間は隠さない）。
 * 行を単押しすると詳細、長押しするとその詳細が編集で開く（アプリ全体の「単押しは閲覧、長押しは編集」）。
 * AppBar の検索窓は内容で履歴を絞り込み（絞り込みはサーバーが掛ける）、その右の絞り込みボタンで金額・日付の範囲と To・From の
 * 詳細な検索を AppBar の下に開く（タイルは絞り込みに関わらず全体を示す）。
 */
function ExpensesPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const filter = useFilterSearch(search, EXPENSE_FILTER_CONDITIONS);
  // この画面が読むもの: 口座、精算の元になる合計、絞り込んだ履歴
  useScreenQueries([accountsQueryOptions, totalsQueryOptions]);
  const history = useScreenHistory(expenseHistory, filter.listFilter);
  const settlementsQuery = useSettlements();
  // 追加のフォームと、最初に入れておく値（精算のタイルから開くとその精算）
  const adding = useOpenWith<Partial<ExpenseInput>>();
  const selection = useRecordSelection<Expense>();

  const openAdd = () => adding.open({});
  useAddShortcut(search.add, openAdd);
  const { q, since, until } = filter.listFilter;

  const header = (
    <>
      <ExpenseFilterForm
        open={filter.panelOpen}
        filters={filter.filters}
        onChange={filter.setFilters}
      />
      <MoneyHeader
        current="expenses"
        shared={{ q, since, until }}
        onSelectAccount={(account) =>
          navigate({ to: '/money/transactions', search: { account: account.name } })
        }
      >
        <TileSection label="精算">
          <QueryView query={settlementsQuery} skeleton={<SettlementGridSkeleton />}>
            {(settlements) => (
              <SettlementGrid
                settlements={settlements}
                onSelect={(s) => adding.open(settlementExpense(s))}
              />
            )}
          </QueryView>
        </TileSection>
      </MoneyHeader>
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
